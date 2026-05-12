import {
  getLlama,
  type LlamaContext,
  LlamaChatSession,
  QwenChatWrapper,
  type ChatHistoryItem,
  type Llama,
  type LlamaModel,
} from "node-llama-cpp";
import type {
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmMessage,
} from "./client.js";
import type { Role1RuntimeConfig } from "../prompt/config.js";
import {
  assertValidGgufModelFile,
  resolveConfiguredRole1ModelPath,
} from "./gguf-file.js";
import { logger } from "../utils/logger.js";

type NodeLlamaRuntimeConfig = Pick<
  Role1RuntimeConfig,
  | "localLlmModelName"
  | "localLlmModelDir"
  | "localLlmModelPath"
  | "localLlmHfRepo"
  | "localLlmHfFile"
  | "localLlmDevice"
  | "localLlmGpuLayers"
  | "localLlmContextSize"
  | "localLlmTopK"
  | "localLlmTopP"
  | "localLlmMaxTokens"
  | "localLlmReasoning"
>;

interface LoadedNodeLlamaRuntime {
  signature: string;
  llama: Llama;
  model: LlamaModel;
  context: LlamaContext;
  session: LlamaChatSession;
  completionMode: "completePrompt" | "promptWithMeta";
  reasoningDisabled: boolean;
  qwenVariation?: "3" | "3.5";
}

let loadedRuntime: LoadedNodeLlamaRuntime | null = null;
let runtimeLoadPromise: Promise<LoadedNodeLlamaRuntime> | null = null;
let runtimeSignature: string | null = null;

function toNodeRuntimeConfig(
  config: NodeLlamaRuntimeConfig,
): NodeLlamaRuntimeConfig {
  return {
    localLlmModelName: config.localLlmModelName,
    localLlmModelDir: config.localLlmModelDir,
    localLlmModelPath: config.localLlmModelPath,
    localLlmHfRepo: config.localLlmHfRepo,
    localLlmHfFile: config.localLlmHfFile,
    localLlmDevice: config.localLlmDevice,
    localLlmGpuLayers: config.localLlmGpuLayers,
    localLlmContextSize: config.localLlmContextSize,
    localLlmTopK: config.localLlmTopK,
    localLlmTopP: config.localLlmTopP,
    localLlmMaxTokens: config.localLlmMaxTokens,
    localLlmReasoning: config.localLlmReasoning,
  };
}

export function buildNodeLlamaRuntimeSignature(
  config: NodeLlamaRuntimeConfig,
): string {
  return JSON.stringify(toNodeRuntimeConfig(config));
}

function resolveNodeLlamaModelPath(config: NodeLlamaRuntimeConfig): string {
  const modelPath = resolveConfiguredRole1ModelPath({
    localLlmModelPath: config.localLlmModelPath,
    localLlmModelDir: config.localLlmModelDir,
    localLlmHfFile: config.localLlmHfFile,
  });

  if (!modelPath) {
    throw new Error(
      "node-llama-cpp runtime requires LOCAL_LLM_MODEL_PATH or LOCAL_LLM_MODEL_DIR + LOCAL_LLM_HF_FILE",
    );
  }

  assertValidGgufModelFile(modelPath);
  return modelPath;
}

function looksLikeGemma4Family(config: NodeLlamaRuntimeConfig): boolean {
  return [
    config.localLlmModelName,
    config.localLlmHfRepo,
    config.localLlmHfFile,
    config.localLlmModelPath,
  ]
    .filter((value): value is string => typeof value === "string")
    .some((value) => /gemma-?4|supergemma4/iu.test(value));
}

function resolveGpuEnabled(config: NodeLlamaRuntimeConfig): boolean {
  return config.localLlmDevice !== "none" && config.localLlmGpuLayers !== "0";
}

function resolveGpuLayers(config: NodeLlamaRuntimeConfig): "auto" | "max" | number {
  if (!resolveGpuEnabled(config)) {
    return 0;
  }

  if (!config.localLlmGpuLayers || config.localLlmGpuLayers === "auto") {
    return "auto";
  }

  if (config.localLlmGpuLayers === "all") {
    return "max";
  }

  const parsed = Number(config.localLlmGpuLayers);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return "auto";
  }

  return parsed;
}

function isReasoningDisabled(config: NodeLlamaRuntimeConfig): boolean {
  return (config.localLlmReasoning ?? "off").trim().toLowerCase() === "off";
}

async function disposeLoadedRuntime(
  runtime: LoadedNodeLlamaRuntime | null,
): Promise<boolean> {
  if (!runtime) {
    return false;
  }

  runtime.session.dispose?.();
  await runtime.context.dispose();
  await runtime.model.dispose();
  await runtime.llama.dispose();
  return true;
}

async function completePromptOnce(
  runtime: LoadedNodeLlamaRuntime,
  chatHistory: ChatHistoryItem[],
  prompt: string,
  options: {
    maxTokens: number;
    temperature: number;
    topK: number;
    topP: number;
    signal: AbortSignal;
  },
): Promise<string> {
  runtime.session.setChatHistory(chatHistory);

  if (runtime.completionMode === "promptWithMeta") {
    const result = await runtime.session.promptWithMeta(prompt, {
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      topK: options.topK,
      topP: options.topP,
      trimWhitespaceSuffix: true,
      ...(runtime.reasoningDisabled
        ? {
            budgets: {
              thoughtTokens: 0,
            },
          }
        : {}),
      signal: options.signal,
    });

    return result.responseText;
  }

  return await runtime.session.completePrompt(prompt, {
    maxTokens: options.maxTokens,
    temperature: options.temperature,
    topK: options.topK,
    topP: options.topP,
    trimWhitespaceSuffix: true,
    signal: options.signal,
  });
}

function resolveQwenVariation(
  architecture: string | undefined,
  config: NodeLlamaRuntimeConfig,
): "3" | "3.5" {
  const hints = [
    architecture,
    config.localLlmModelName,
    config.localLlmHfRepo,
    config.localLlmHfFile,
    config.localLlmModelPath,
  ].filter((value): value is string => typeof value === "string");

  return hints.some((value) => /qwen\s*3\.5|qwen3\.5|qwen35/iu.test(value))
    ? "3.5"
    : "3";
}

async function loadRuntimeWithOptions(
  config: NodeLlamaRuntimeConfig,
  {
    gpuEnabled,
    gpuLayers,
  }: {
    gpuEnabled: boolean;
    gpuLayers: "auto" | "max" | number;
  },
): Promise<LoadedNodeLlamaRuntime> {
  const modelPath = resolveNodeLlamaModelPath(config);
  const signature = buildNodeLlamaRuntimeSignature(config);
  const llama = await getLlama({
    gpu: gpuEnabled ? "auto" : false,
  });
  let model: LlamaModel | null = null;
  let context: LlamaContext | null = null;
  let session: LlamaChatSession | null = null;

  try {
    model = await llama.loadModel({
      modelPath,
      gpuLayers,
    });
    const architecture = model.fileInfo?.metadata?.general?.architecture;
    const isQwenReasoningArchitecture =
      typeof architecture === "string" &&
      architecture.toLowerCase().startsWith("qwen3");
    const completionMode: "completePrompt" | "promptWithMeta" =
      isQwenReasoningArchitecture ? "promptWithMeta" : "completePrompt";
    const qwenVariation =
      completionMode === "promptWithMeta"
        ? resolveQwenVariation(architecture, config)
        : undefined;
    const reasoningDisabled = isReasoningDisabled(config);
    context = await model.createContext({
      contextSize: config.localLlmContextSize ?? 4096,
    });
    session = new LlamaChatSession({
      contextSequence: context.getSequence(),
      ...(completionMode === "promptWithMeta"
        ? {
            chatWrapper: new QwenChatWrapper({
              variation: qwenVariation ?? "3",
              thoughts: reasoningDisabled ? "discourage" : "auto",
            }),
          }
        : {}),
    });

    return {
      signature,
      llama,
      model,
      context,
      session,
      completionMode,
      reasoningDisabled,
      ...(qwenVariation ? { qwenVariation } : {}),
    };
  } catch (error) {
    session?.dispose?.();
    if (context) {
      await context.dispose();
    }
    if (model) {
      await model.dispose();
    }
    await llama.dispose();

    if (
      looksLikeGemma4Family(config) &&
      error instanceof Error &&
      error.message.includes("Failed to load model")
    ) {
      throw new Error(
        "현재 설치된 node-llama-cpp backend가 Gemma 4 계열 GGUF를 직접 로드하지 못했습니다. 이 환경에서는 LOCAL_LLM_RUNTIME_PROVIDER=llama-server를 유지하거나, Gemma 4를 지원하는 더 최신 llama.cpp backend를 준비한 뒤 다시 시도하세요.",
      );
    }

    throw error;
  }
}

async function createLoadedRuntime(
  config: NodeLlamaRuntimeConfig,
): Promise<LoadedNodeLlamaRuntime> {
  const gpuEnabled = resolveGpuEnabled(config);

  try {
    return await loadRuntimeWithOptions(config, {
      gpuEnabled,
      gpuLayers: resolveGpuLayers(config),
    });
  } catch (error) {
    if (!gpuEnabled) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`node-llama-cpp GPU startup failed, retrying with CPU only: ${message}`);

    return await loadRuntimeWithOptions(config, {
      gpuEnabled: false,
      gpuLayers: 0,
    });
  }
}

export async function ensureNodeLlamaCppRuntime(
  config: NodeLlamaRuntimeConfig,
): Promise<void> {
  const signature = buildNodeLlamaRuntimeSignature(config);

  if (loadedRuntime && runtimeSignature === signature) {
    return;
  }

  if (runtimeLoadPromise && runtimeSignature === signature) {
    await runtimeLoadPromise;
    return;
  }

  await shutdownNodeLlamaCppRuntime();
  runtimeSignature = signature;

  const nextPromise = createLoadedRuntime(config)
    .then((runtime) => {
      loadedRuntime = runtime;
      return runtime;
    })
    .catch((error) => {
      if (runtimeSignature === signature) {
        runtimeSignature = null;
      }
      throw error;
    })
    .finally(() => {
      if (runtimeLoadPromise === nextPromise) {
        runtimeLoadPromise = null;
      }
    });

  runtimeLoadPromise = nextPromise;
  await nextPromise;
}

function resolveMessageText(content: string): string {
  return content;
}

function convertMessagesToChatHistory(
  messages: LlmMessage[],
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

export async function completeChatWithNodeLlamaCpp(
  request: LlmCompletionRequest,
  config: NodeLlamaRuntimeConfig,
): Promise<LlmCompletionResponse> {
  await ensureNodeLlamaCppRuntime(config);

  if (!loadedRuntime) {
    throw new Error("node-llama-cpp runtime is not ready");
  }

  const { chatHistory, prompt } = convertMessagesToChatHistory(request.messages);
  const isQwenReasoningArchitecture =
    loadedRuntime.completionMode === "promptWithMeta";
  const controller = new AbortController();
  const baseTimeoutMs = request.timeout_ms ?? 30_000;
  const timeoutMs = isQwenReasoningArchitecture
    ? Math.max(baseTimeoutMs, 60_000)
    : baseTimeoutMs;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  const baseMaxTokens = request.max_tokens ?? config.localLlmMaxTokens ?? 512;
  const completionOptions = {
    maxTokens: isQwenReasoningArchitecture
      ? Math.max(baseMaxTokens, 1024)
      : baseMaxTokens,
    temperature: request.temperature ?? 0,
    topK: config.localLlmTopK ?? 40,
    topP: config.localLlmTopP ?? 0.95,
    signal: controller.signal,
  };

  try {
    const content = await completePromptOnce(
      loadedRuntime,
      chatHistory,
      prompt,
      completionOptions,
    );

    const rawResponse = {
      choices: [
        {
          message: {
            content,
          },
        },
      ],
    } satisfies Record<string, unknown>;

    return {
      content,
      raw_response: rawResponse,
      inference_time_sec: (Date.now() - startedAt) / 1000,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`LLM request timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function shutdownNodeLlamaCppRuntime(): Promise<boolean> {
  const disposed = await disposeLoadedRuntime(loadedRuntime);
  loadedRuntime = null;
  runtimeLoadPromise = null;
  runtimeSignature = null;
  return disposed;
}
