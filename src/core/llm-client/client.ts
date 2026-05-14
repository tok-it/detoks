import { completeChatWithNodeLlamaCpp } from "./node-llama-runtime.js";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCompletionRequest {
  messages: LlmMessage[];
  temperature?: number;
  max_tokens?: number;
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
  localLlmRuntimeProvider?: "node-llama-cpp";
  localLlmModelName?: string;
  localLlmModelDir?: string;
  localLlmModelPath?: string;
  localLlmHfRepo?: string;
  localLlmHfFile?: string;
  localLlmDevice?: string;
  localLlmGpuLayers?: string;
  localLlmContextSize?: number;
  localLlmTopK?: number;
  localLlmTopP?: number;
  localLlmMaxTokens?: number;
  fetchImplementation?: typeof fetch;
}

export async function complete_chat(
  request: LlmCompletionRequest,
  options: LlmClientOptions,
): Promise<LlmCompletionResponse> {
  if (!options.localLlmModelName) {
    throw new Error("LLM client requires LOCAL_LLM_MODEL_NAME");
  }

  return await completeChatWithNodeLlamaCpp(request, {
    ...(options.localLlmModelName
      ? { localLlmModelName: options.localLlmModelName }
      : {}),
    ...(options.localLlmModelDir
      ? { localLlmModelDir: options.localLlmModelDir }
      : {}),
    ...(options.localLlmModelPath
      ? { localLlmModelPath: options.localLlmModelPath }
      : {}),
    ...(options.localLlmHfRepo
      ? { localLlmHfRepo: options.localLlmHfRepo }
      : {}),
    ...(options.localLlmHfFile
      ? { localLlmHfFile: options.localLlmHfFile }
      : {}),
    ...(options.localLlmDevice
      ? { localLlmDevice: options.localLlmDevice }
      : {}),
    ...(options.localLlmGpuLayers
      ? { localLlmGpuLayers: options.localLlmGpuLayers }
      : {}),
    ...(options.localLlmContextSize
      ? { localLlmContextSize: options.localLlmContextSize }
      : {}),
    ...(options.localLlmTopK !== undefined
      ? { localLlmTopK: options.localLlmTopK }
      : {}),
    ...(options.localLlmTopP !== undefined
      ? { localLlmTopP: options.localLlmTopP }
      : {}),
    ...(options.localLlmMaxTokens !== undefined
      ? { localLlmMaxTokens: options.localLlmMaxTokens }
      : {}),
  });
}
