import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { getLlama, LlamaChatSession, type ChatHistoryItem } from "node-llama-cpp";
import { assertValidGgufModelFile, resolveConfiguredRole1ModelPath } from "./gguf-file.js";

const NODE_LLAMA_CONFIG_ENV = "DETOKS_NODE_LLAMA_CONFIG";

interface NodeLlamaSidecarConfig {
  apiBase?: string;
  modelName?: string;
  modelDir?: string;
  modelPath?: string;
  modelUrl?: string;
  hfRepo?: string;
  hfFile?: string;
  host?: string;
  port?: number;
  contextSize?: number;
  topK?: number;
  topP?: number;
  maxTokens?: number;
  gpuLayers?: string;
  device?: string;
}

interface OpenAiTextPart {
  type: "text";
  text: string;
}

interface OpenAiMessage {
  role: "system" | "user" | "assistant";
  content?: string | OpenAiTextPart[] | null;
}

interface OpenAiChatCompletionsRequest {
  model?: string;
  messages?: OpenAiMessage[];
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  top_k?: number;
  top_p?: number;
  seed?: number;
  stop?: string | string[] | null;
  stream?: boolean;
}

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function parseRuntimeConfig(): NodeLlamaSidecarConfig {
  const raw = process.env[NODE_LLAMA_CONFIG_ENV];
  if (!raw) {
    throw new Error(`${NODE_LLAMA_CONFIG_ENV} is required`);
  }

  const parsed = JSON.parse(raw) as NodeLlamaSidecarConfig;
  return parsed;
}

function resolveMessageText(content: OpenAiMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => (item?.type === "text" && typeof item.text === "string" ? item.text : ""))
    .join("");
}

function convertMessagesToChatHistory(
  messages: OpenAiMessage[],
): { chatHistory: ChatHistoryItem[]; prompt: string } {
  if (messages.length === 0) {
    throw new Error("messages must not be empty");
  }

  const lastMessage = messages.at(-1);
  if (!lastMessage || lastMessage.role !== "user") {
    throw new Error("the final chat message must have role 'user'");
  }

  const prompt = resolveMessageText(lastMessage.content);
  const chatHistory: ChatHistoryItem[] = [];

  for (const message of messages.slice(0, -1)) {
    const text = resolveMessageText(message.content);

    if (message.role === "system") {
      chatHistory.push({
        type: "system",
        text,
      });
      continue;
    }

    if (message.role === "user") {
      chatHistory.push({
        type: "user",
        text,
      });
      continue;
    }

    chatHistory.push({
      type: "model",
      response: [text],
    });
  }

  return { chatHistory, prompt };
}

function resolveStopTriggers(stop: OpenAiChatCompletionsRequest["stop"]): string[] | undefined {
  if (typeof stop === "string") {
    return [stop];
  }

  if (Array.isArray(stop)) {
    return stop.filter((item): item is string => typeof item === "string");
  }

  return undefined;
}

function resolveGpuEnabled(config: NodeLlamaSidecarConfig): boolean {
  return config.device !== "none" && config.gpuLayers !== "0";
}

function resolveGpuLayers(config: NodeLlamaSidecarConfig): "auto" | "max" | number {
  if (!resolveGpuEnabled(config)) {
    return 0;
  }

  if (!config.gpuLayers || config.gpuLayers === "auto") {
    return "auto";
  }

  if (config.gpuLayers === "all") {
    return "max";
  }

  const parsed = Number(config.gpuLayers);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return "auto";
  }

  return parsed;
}

function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.once("end", () => {
      try {
        resolve(JSON.parse(body) as T);
      } catch (error) {
        reject(error);
      }
    });
    request.once("error", reject);
  });
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function resolveModelPath(config: NodeLlamaSidecarConfig): string {
  const modelPath = resolveConfiguredRole1ModelPath({
    localLlmModelPath: config.modelPath,
    localLlmModelDir: config.modelDir,
    localLlmHfFile: config.hfFile,
  });

  if (!modelPath) {
    throw new Error(
      "node-llama-cpp runtime requires LOCAL_LLM_MODEL_PATH or LOCAL_LLM_MODEL_DIR + LOCAL_LLM_HF_FILE",
    );
  }

  assertValidGgufModelFile(modelPath);
  return modelPath;
}

function looksLikeGemma4Family(config: NodeLlamaSidecarConfig): boolean {
  return [config.modelName, config.hfRepo, config.hfFile, config.modelPath]
    .filter((value): value is string => typeof value === "string")
    .some((value) => /gemma-?4|supergemma4/iu.test(value));
}

async function main(): Promise<void> {
  const runtimeConfig = parseRuntimeConfig();
  const apiBase = runtimeConfig.apiBase ?? "http://127.0.0.1:12370/v1";
  const host = runtimeConfig.host ?? new URL(apiBase).hostname;
  const port = runtimeConfig.port ?? Number(new URL(apiBase).port || 12370);
  const modelName = runtimeConfig.modelName ?? "local-model";
  const modelPath = resolveModelPath(runtimeConfig);

  log(`[startup] loading model ${modelName} from ${modelPath}`);
  const llama = await getLlama({
    gpu: resolveGpuEnabled(runtimeConfig) ? "auto" : false,
  });
  let model;
  try {
    model = await llama.loadModel({
      modelPath,
      gpuLayers: resolveGpuLayers(runtimeConfig),
    });
  } catch (error) {
    await llama.dispose();

    if (
      looksLikeGemma4Family(runtimeConfig) &&
      error instanceof Error &&
      error.message.includes("Failed to load model")
    ) {
      throw new Error(
        "현재 설치된 node-llama-cpp backend가 Gemma 4 계열 GGUF를 직접 로드하지 못했습니다. 이 환경에서는 LOCAL_LLM_RUNTIME_PROVIDER=llama-server를 유지하거나, Gemma 4를 지원하는 더 최신 llama.cpp backend를 준비한 뒤 다시 시도하세요.",
      );
    }

    throw error;
  }
  log(`[startup] model loaded, listening on http://${host}:${port}`);

  let requestQueue = Promise.resolve();

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${host}:${port}`);

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        status: "ok",
        provider: "node-llama-cpp",
        model: modelName,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/models") {
      sendJson(response, 200, {
        object: "list",
        data: [
          {
            id: modelName,
            object: "model",
            aliases: [modelName],
          },
        ],
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
      try {
        const body = await readJsonBody<OpenAiChatCompletionsRequest>(request);

        if (body.stream) {
          sendJson(response, 400, {
            error: {
              message: "stream=true is not supported by the detoks node-llama-cpp sidecar",
              type: "invalid_request_error",
            },
          });
          return;
        }

        if (body.model && body.model !== modelName) {
          sendJson(response, 400, {
            error: {
              message: `Requested model ${body.model} does not match loaded model ${modelName}`,
              type: "invalid_request_error",
            },
          });
          return;
        }

        const messages = Array.isArray(body.messages) ? body.messages : [];
        const { chatHistory, prompt } = convertMessagesToChatHistory(messages);
        const maxTokens = body.max_completion_tokens ?? body.max_tokens ?? runtimeConfig.maxTokens ?? 512;
        const temperature = body.temperature ?? 0;
        const topK = body.top_k ?? runtimeConfig.topK ?? 40;
        const topP = body.top_p ?? runtimeConfig.topP ?? 0.95;
        const stopTriggers = resolveStopTriggers(body.stop);

        const task = requestQueue.then(async () => {
          const context = await model.createContext({
            contextSize: runtimeConfig.contextSize ?? 4096,
          });
          const session = new LlamaChatSession({
            contextSequence: context.getSequence(),
          });

          try {
            session.setChatHistory(chatHistory);
            const content = await session.prompt(prompt, {
              maxTokens,
              temperature,
              topK,
              topP,
              trimWhitespaceSuffix: true,
              ...(body.seed !== undefined ? { seed: body.seed } : {}),
              ...(stopTriggers && stopTriggers.length > 0
                ? { customStopTriggers: stopTriggers }
                : {}),
            });

            sendJson(response, 200, {
              id: `chatcmpl-${Date.now()}`,
              object: "chat.completion",
              created: Math.floor(Date.now() / 1000),
              model: modelName,
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content,
                  },
                  finish_reason: "stop",
                },
              ],
            });
          } finally {
            session.dispose({ disposeSequence: true });
            await context.dispose();
          }
        });

        requestQueue = task.then(
          () => undefined,
          () => undefined,
        );
        await task;
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(response, 500, {
          error: {
            message,
            type: "server_error",
          },
        });
        return;
      }
    }

    sendJson(response, 404, {
      error: {
        message: `Unsupported route: ${request.method ?? "GET"} ${url.pathname}`,
        type: "invalid_request_error",
      },
    });
  });

  const shutdown = async (): Promise<void> => {
    server.close();
    await model.dispose();
    await llama.dispose();
  };

  process.once("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.once("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => resolveListen());
  });
}

void main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
