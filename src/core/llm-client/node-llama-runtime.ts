import {
  getLlama,
  LlamaChatSession,
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
>;

interface LoadedNodeLlamaRuntime {
  signature: string;
  llama: Llama;
  model: LlamaModel;
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

async function disposeLoadedRuntime(
  runtime: LoadedNodeLlamaRuntime | null,
): Promise<boolean> {
  if (!runtime) {
    return false;
  }

  await runtime.model.dispose();
  await runtime.llama.dispose();
  return true;
}

async function completePromptOnce(
  model: LlamaModel,
  chatHistory: ChatHistoryItem[],
  prompt: string,
  config: NodeLlamaRuntimeConfig,
  options: {
    maxTokens: number;
    temperature: number;
    topK: number;
    topP: number;
    signal: AbortSignal;
    mode: "completePrompt" | "generateResponse";
  },
): Promise<string> {
  const context = await model.createContext({
    contextSize: config.localLlmContextSize ?? 4096,
  });
  const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
  });

  try {
    session.setChatHistory(chatHistory);

    if (options.mode === "generateResponse") {
      const generateResponseSession = session as LlamaChatSession & {
        _chat: {
          generateResponse: (
            history: ChatHistoryItem[],
            responseOptions: {
              abortOnNonText: boolean;
              maxTokens: number;
              temperature: number;
              topK: number;
              topP: number;
              trimWhitespaceSuffix: boolean;
              signal: AbortSignal;
            },
          ) => Promise<{ response: string }>;
        };
      };
      const responseHistory: ChatHistoryItem[] = [
        ...chatHistory,
        {
          type: "user",
          text: prompt,
        },
        {
          type: "model",
          response: [],
        },
      ];
      const result = await generateResponseSession._chat.generateResponse(
        responseHistory,
        {
          abortOnNonText: false,
          maxTokens: options.maxTokens,
          temperature: options.temperature,
          topK: options.topK,
          topP: options.topP,
          trimWhitespaceSuffix: true,
          signal: options.signal,
        },
      );

      return result.response;
    }

    return await session.completePrompt(prompt, {
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      topK: options.topK,
      topP: options.topP,
      trimWhitespaceSuffix: true,
      signal: options.signal,
    });
  } finally {
    session.dispose?.({ disposeSequence: true });
    await context.dispose();
  }
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

  try {
    const model = await llama.loadModel({
      modelPath,
      gpuLayers,
    });

    return {
      signature,
      llama,
      model,
    };
  } catch (error) {
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
  const architecture =
    loadedRuntime.model.fileInfo?.metadata?.general?.architecture;
  const isQwenReasoningArchitecture =
    typeof architecture === "string" &&
    architecture.toLowerCase().startsWith("qwen3");
  const controller = new AbortController();
  const baseTimeoutMs = request.timeout_ms ?? 30_000;
  const timeoutMs = isQwenReasoningArchitecture
    ? Math.max(baseTimeoutMs, 60_000)
    : baseTimeoutMs;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  const baseMaxTokens = request.max_tokens ?? config.localLlmMaxTokens ?? 512;
  const completionMode: "completePrompt" | "generateResponse" =
    isQwenReasoningArchitecture ? "generateResponse" : "completePrompt";
  const completionOptions = {
    maxTokens: isQwenReasoningArchitecture
      ? Math.max(baseMaxTokens, 1024)
      : baseMaxTokens,
    temperature: request.temperature ?? 0,
    topK: config.localLlmTopK ?? 40,
    topP: config.localLlmTopP ?? 0.95,
    signal: controller.signal,
    mode: completionMode,
  };

  try {
    const content = await completePromptOnce(
      loadedRuntime.model,
      chatHistory,
      prompt,
      config,
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
