import { logger } from "../utils/logger.js";
import { translateVisibleText } from "../utils/visibleText.js";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCompletionRequest {
  messages: LlmMessage[];
  temperature?: number;
  timeout_ms?: number;
}

export interface LlmCompletionResponse {
  content: string;
  raw_response?: Record<string, unknown>;
  inference_time_sec?: number;
}

export interface LlmClientOptions {
  apiBase?: string;
  apiKey?: string;
  localLlmModelName?: string;
  fetchImplementation?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 30_000;

function buildChatCompletionsUrl(apiBase: string): string {
  return new URL(
    "chat/completions",
    apiBase.endsWith("/") ? apiBase : `${apiBase}/`,
  ).toString();
}

function extractContent(payload: Record<string, unknown>): string {
  const choice = Array.isArray(payload.choices)
    ? payload.choices[0]
    : undefined;

  if (!choice || typeof choice !== "object") {
    throw new Error("Invalid LLM response: missing choices[0]");
  }

  const message =
    "message" in choice && choice.message && typeof choice.message === "object"
      ? choice.message
      : undefined;

  if (!message || !("content" in message)) {
    throw new Error("Invalid LLM response: missing message content");
  }

  const content = message.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (!item || typeof item !== "object") {
          return "";
        }

        if ("text" in item && typeof item.text === "string") {
          return item.text;
        }

        return "";
      })
      .join("");
  }

  throw new Error("Invalid LLM response: unsupported content shape");
}

export async function complete_chat(
  request: LlmCompletionRequest,
  options: LlmClientOptions,
): Promise<LlmCompletionResponse> {
  if (!options.apiBase) {
    throw new Error("LLM client requires LOCAL_LLM_API_BASE");
  }

  if (!options.localLlmModelName) {
    throw new Error("LLM client requires LOCAL_LLM_MODEL_NAME");
  }

  const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
  if (!fetchImplementation) {
    throw new Error("LLM client requires fetch support");
  }

  const controller = new AbortController();
  const timeoutMs = request.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetchImplementation(
      buildChatCompletionsUrl(options.apiBase),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(options.apiKey
            ? { authorization: `Bearer ${options.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model: options.localLlmModelName,
          messages: request.messages,
          temperature: request.temperature ?? 0,
        }),
        signal: controller.signal,
      },
    );

    if (!response || typeof response.json !== "function") {
      throw new Error("Invalid LLM response: fetch returned no response");
    }

    const rawResponse = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(
        `LLM request failed: ${response.status} ${response.statusText}`,
      );
    }

    return {
      content: extractContent(rawResponse),
      raw_response: rawResponse,
      inference_time_sec: (Date.now() - startedAt) / 1000,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`LLM request timed out after ${timeoutMs}ms`);
    }

    logger.error(
      "LLM 요청에 실패했습니다",
      translateVisibleText(error instanceof Error ? error.message : String(error)),
    );
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
