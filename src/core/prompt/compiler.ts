import {
  PromptCompileRequestSchema,
  PromptCompileResponseSchema,
  Role2PromptInputSchema,
  type PromptCompileRequest,
  type PromptCompileResponse,
  type Role2PromptInput,
} from "../../schemas/pipeline.js";
import { loadRole1Policies, loadRole1RuntimeConfig } from "./config.js";

const SUPPORTED_COMPRESSION_PROVIDER = "nlp_adapter";

function detectLanguage(rawInput: string): "ko" | "en" | "mixed" {
  const hasKorean = /[가-힣]/.test(rawInput);
  const hasLatin = /[A-Za-z]/.test(rawInput);

  if (hasKorean && hasLatin) {
    return "mixed";
  }

  if (hasKorean) {
    return "ko";
  }

  return "en";
}

function normalizeInput(rawInput: string): string {
  return rawInput
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function compressPrompt(normalizedInput: string): string {
  return normalizedInput;
}

export function compilePrompt(
  input: PromptCompileRequest,
): PromptCompileResponse {
  const request = PromptCompileRequestSchema.parse(input);
  loadRole1RuntimeConfig();
  loadRole1Policies();
  const provider = request.compression_provider ?? SUPPORTED_COMPRESSION_PROVIDER;

  if (provider !== SUPPORTED_COMPRESSION_PROVIDER) {
    throw new Error(`Unsupported prompt compression provider: ${provider}`);
  }

  const normalizedInput = normalizeInput(request.raw_input);
  const compressedPrompt = compressPrompt(normalizedInput);

  return PromptCompileResponseSchema.parse({
    raw_input: request.raw_input,
    normalized_input: normalizedInput,
    compressed_prompt: compressedPrompt,
    language: detectLanguage(request.raw_input),
    compression_provider: SUPPORTED_COMPRESSION_PROVIDER,
  });
}

export function createRole2PromptInput(
  compiledPrompt: PromptCompileResponse,
): Role2PromptInput {
  return Role2PromptInputSchema.parse({
    compiled_prompt: compiledPrompt.compressed_prompt,
  });
}
