import {
  PromptCompileRequestSchema,
  PromptCompileResponseSchema,
  Role2PromptInputSchema,
  type PromptCompileRequest,
  type PromptCompileResponse,
  type Role2PromptInput,
} from "../../schemas/pipeline.js";
import { loadRole1Policies, loadRole1RuntimeConfig } from "./config.js";
import {
  compress_prompt,
  type CompressTextImplementation,
} from "./compression.js";
import { translate_to_english } from "../translate/translate.js";

const SUPPORTED_COMPRESSION_PROVIDER = "kompress";
const LEGACY_COMPRESSION_PROVIDER = "nlp_adapter";

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

export interface CompilePromptOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  fetchImplementation?: typeof fetch;
  compressionImplementation?: CompressTextImplementation;
}

export async function compilePrompt(
  input: PromptCompileRequest,
  options: CompilePromptOptions = {},
): Promise<PromptCompileResponse> {
  const request = PromptCompileRequestSchema.parse(input);
  const runtimeConfig = loadRole1RuntimeConfig({
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.env ? { env: options.env } : {}),
  });
  const policies = loadRole1Policies({
    ...(options.cwd ? { cwd: options.cwd } : {}),
  });
  const provider = request.compression_provider ?? SUPPORTED_COMPRESSION_PROVIDER;

  if (
    provider !== SUPPORTED_COMPRESSION_PROVIDER &&
    provider !== LEGACY_COMPRESSION_PROVIDER
  ) {
    throw new Error(`Unsupported prompt compression provider: ${provider}`);
  }

  const normalizedInput = normalizeInput(request.raw_input);
  const language = detectLanguage(request.raw_input);
  const translationResult =
    language === "en"
      ? null
      : await translate_to_english(normalizedInput, {
          config: runtimeConfig,
          policies,
          ...(options.fetchImplementation
            ? { fetchImplementation: options.fetchImplementation }
            : {}),
        });
  const translatedOutput = translationResult?.text ?? normalizedInput;
  const compressionResult = await compress_prompt(translatedOutput, {
    policies,
    config: runtimeConfig,
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.env ? { env: options.env } : {}),
    ...(runtimeConfig.localLlmModelName
      ? { localLlmModelName: runtimeConfig.localLlmModelName }
      : {}),
    ...(options.compressionImplementation
      ? { compressionImplementation: options.compressionImplementation }
      : {}),
  });
  const repairActions = [
    ...(translationResult?.repair_actions ?? []),
    ...compressionResult.repair_actions,
  ];

  return PromptCompileResponseSchema.parse({
    raw_input: request.raw_input,
    normalized_input: translatedOutput,
    compressed_prompt: compressionResult.compressed_prompt,
    language,
    compression_provider: SUPPORTED_COMPRESSION_PROVIDER,
    ...(translationResult
      ? {
          inference_time_sec: translationResult.inference_time_sec,
        }
      : {
          inference_time_sec: 0,
        }),
    ...(translationResult
      ? {
          validation_errors: translationResult.validation_errors,
        }
      : {}),
    ...(repairActions.length > 0 ? { repair_actions: repairActions } : {}),
    ...(translationResult?.debug ? { debug: translationResult.debug } : {}),
  });
}

export function createRole2PromptInput(
  compiledPrompt: PromptCompileResponse,
): Role2PromptInput {
  return Role2PromptInputSchema.parse({
    compiled_prompt: compiledPrompt.normalized_input,
  });
}
