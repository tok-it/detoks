#!/usr/bin/env tsx

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { get_encoding } from "tiktoken";
import { runBatchPromptPipeline } from "../src/core/pipeline/batch.js";
import {
  loadRole1Policies,
  loadRole1RuntimeConfig,
} from "../src/core/prompt/config.js";
import { mask_protected_segments } from "../src/core/translate/masking.js";

interface VerifyOptions {
  prompt?: string;
  filePath: string;
  limit?: number;
  index?: number;
  outputPath?: string;
  debug: boolean;
}

interface BatchInput {
  data: string[];
}

interface VerificationItem {
  index: number;
  raw_input: string;
  ph_masked_input: string;
  normalized_input: string;
  compiled_prompt: string;
  role2_handoff: string;
  language: "ko" | "en" | "mixed";
  status: "completed" | "failed";
  inference_time_sec: number;
  input_prompt_tokens: number;
  normalized_input_tokens: number;
  compiled_prompt_tokens: number;
  token_reduction_rate: number | null;
  translation_token_reduction_rate: number | null;
  compression_token_reduction_rate: number | null;
  validation_errors: string[];
  repair_actions: string[];
  error?: string;
  debug?: {
    masked_text: string;
    placeholders: Array<{
      placeholder: string;
      original: string;
      kind: string;
    }>;
    spans: Array<{
      kind: string;
      text: string;
      translate: boolean;
    }>;
    fallback_span_count: number;
  };
}

interface VerificationSummary {
  completed_count: number;
  failed_count: number;
  average_inference_time_sec: number;
  average_token_reduction_rate: number;
  average_translation_token_reduction_rate: number;
  average_compression_token_reduction_rate: number;
  compression_fallback_count: number;
  repair_action_item_count: number;
  validation_failed_count: number;
}

function getUsage(): string {
  return [
    "Usage:",
    "  npm run verify:role1 -- --prompt \"새 파일을 생성해\"",
    "  npm run verify:role1 -- --file tests/data/row_data.json --limit 5",
    "  npm run verify:role1 -- --file tests/data/row_data.json --index 12 --debug --output tmp/role1-result.json",
    "",
    "Options:",
    "  --prompt <text>    단일 프롬프트 수동 검증",
    "  --file <path>      입력 JSON 파일 경로 (기본: tests/data/row_data.json)",
    "  --limit <n>        앞에서부터 n개만 실행",
    "  --index <n>        0-based 특정 인덱스 1개만 실행",
    "  --output <path>    결과 JSON 저장 경로",
    "  --debug            PIPELINE_MODE=debug로 실행",
    "  --help             도움말 출력",
  ].join("\n");
}

function parseArgs(argv: string[]): VerifyOptions {
  let prompt: string | undefined;
  let filePath = "tests/data/row_data.json";
  let limit: number | undefined;
  let index: number | undefined;
  let outputPath: string | undefined;
  let debug = false;

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current) {
      continue;
    }

    if (current === "--help" || current === "-h") {
      console.log(getUsage());
      process.exit(0);
    }

    if (current === "--debug") {
      debug = true;
      continue;
    }

    if (current === "--prompt") {
      prompt = argv[i + 1];
      i += 1;
      continue;
    }

    if (current === "--file") {
      filePath = argv[i + 1] ?? filePath;
      i += 1;
      continue;
    }

    if (current === "--limit") {
      limit = Number(argv[i + 1]);
      i += 1;
      continue;
    }

    if (current === "--index") {
      index = Number(argv[i + 1]);
      i += 1;
      continue;
    }

    if (current === "--output") {
      outputPath = argv[i + 1];
      i += 1;
      continue;
    }

    if (!current.startsWith("--") && !prompt) {
      prompt = current;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error("--limit must be a positive integer");
  }

  if (index !== undefined && (!Number.isInteger(index) || index < 0)) {
    throw new Error("--index must be a non-negative integer");
  }

  return {
    prompt,
    filePath,
    limit,
    index,
    outputPath,
    debug,
  };
}

function loadInputs(options: VerifyOptions): string[] {
  if (options.prompt) {
    return [options.prompt];
  }

  const absolutePath = resolve(process.cwd(), options.filePath);
  const parsed = JSON.parse(readFileSync(absolutePath, "utf8")) as BatchInput;

  if (!Array.isArray(parsed.data)) {
    throw new Error(`Invalid input file shape: ${absolutePath}`);
  }

  let rows = parsed.data;

  if (options.index !== undefined) {
    const item = rows[options.index];
    if (item === undefined) {
      throw new Error(`Index out of range: ${options.index}`);
    }
    rows = [item];
  } else if (options.limit !== undefined) {
    rows = rows.slice(0, options.limit);
  }

  return rows;
}

function maskApiKey(value: string | undefined): string {
  if (!value) {
    return "(not set)";
  }

  if (value.length <= 6) {
    return "***";
  }

  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}

function roundMetric(value: number): number {
  return Number(value.toFixed(3));
}

function encodeTokenCount(
  encoding: ReturnType<typeof get_encoding>,
  text: string,
): number {
  return encoding.encode(text).length;
}

function calculateTokenReductionRate(
  inputPromptTokens: number,
  compiledPromptTokens: number,
): number | null {
  if (inputPromptTokens <= 0 || compiledPromptTokens <= 0) {
    return null;
  }

  return roundMetric(
    ((inputPromptTokens - compiledPromptTokens) / inputPromptTokens) * 100,
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const runtimeConfig = loadRole1RuntimeConfig({
    env: {
      ...process.env,
      ...(options.debug ? { PIPELINE_MODE: "debug" } : {}),
    },
  });
  const policies = loadRole1Policies();
  const inputs = loadInputs(options);

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "role1-verify",
        model: runtimeConfig.modelName ?? "(not set)",
        api_base: runtimeConfig.openaiApiBase ?? "(not set)",
        api_key: maskApiKey(runtimeConfig.openaiApiKey),
        pipeline_mode: options.debug ? "debug" : runtimeConfig.pipelineMode,
        input_count: inputs.length,
      },
      null,
      2,
    ),
  );

  const batchResult = await runBatchPromptPipeline(inputs, {
    env: {
      ...process.env,
      ...(options.debug ? { PIPELINE_MODE: "debug" } : {}),
    },
  });
  const encoding = get_encoding("o200k_base");

  try {
    const results: VerificationItem[] = batchResult.results.map((item, index) => {
      const inputPromptTokens = encodeTokenCount(encoding, item.raw_input);
      const phMaskedInput = mask_protected_segments(item.raw_input, {
        protected_terms: policies.protectedTerms,
        preferred_translations: policies.preferredTranslations,
        model_names: runtimeConfig.localLlmModelName
          ? [runtimeConfig.localLlmModelName]
          : [],
      }).masked_text;
      const normalizedInput = item.normalized_input ?? "";
      const normalizedInputTokens = encodeTokenCount(encoding, normalizedInput);
      const compiledPrompt = item.compiled_prompt ?? "";
      const compiledPromptTokens = encodeTokenCount(encoding, compiledPrompt);

      return {
        index: options.index !== undefined ? options.index : index,
        raw_input: item.raw_input,
        ph_masked_input: phMaskedInput,
        normalized_input: normalizedInput,
        compiled_prompt: compiledPrompt,
        role2_handoff: item.role2_handoff ?? "",
        language: item.language ?? "en",
        status: item.status,
        inference_time_sec: item.inference_time_sec ?? 0,
        input_prompt_tokens: inputPromptTokens,
        normalized_input_tokens: normalizedInputTokens,
        compiled_prompt_tokens: compiledPromptTokens,
        token_reduction_rate: calculateTokenReductionRate(
          inputPromptTokens,
          compiledPromptTokens,
        ),
        translation_token_reduction_rate: calculateTokenReductionRate(
          inputPromptTokens,
          normalizedInputTokens,
        ),
        compression_token_reduction_rate: calculateTokenReductionRate(
          normalizedInputTokens,
          compiledPromptTokens,
        ),
        validation_errors: item.validation_errors,
        repair_actions: item.repair_actions,
        ...(item.error ? { error: item.error } : {}),
        ...(item.debug ? { debug: item.debug } : {}),
      };
    });

    for (const item of results) {
      console.log(
        JSON.stringify(
          {
            index: item.index,
            status: item.status,
            language: item.language,
            raw_input: item.raw_input,
            ph_masked_input: item.ph_masked_input,
            normalized_input: item.normalized_input,
            compiled_prompt: item.compiled_prompt,
            role2_handoff: item.role2_handoff,
            inference_time_sec: item.inference_time_sec,
            input_prompt_tokens: item.input_prompt_tokens,
            normalized_input_tokens: item.normalized_input_tokens,
            compiled_prompt_tokens: item.compiled_prompt_tokens,
            token_reduction_rate: item.token_reduction_rate,
            translation_token_reduction_rate:
              item.translation_token_reduction_rate,
            compression_token_reduction_rate:
              item.compression_token_reduction_rate,
            validation_errors: item.validation_errors,
            repair_actions: item.repair_actions,
            ...(item.error ? { error: item.error } : {}),
            ...(options.debug && item.debug
              ? {
                  debug: {
                    masked_text: item.debug.masked_text,
                    placeholder_count: item.debug.placeholders.length,
                    span_count: item.debug.spans.length,
                    fallback_span_count: item.debug.fallback_span_count,
                  },
                }
              : {}),
          },
          null,
          2,
        ),
      );
    }

    const completedCount = results.filter((item) => item.status === "completed").length;
    const failedCount = results.length - completedCount;
    const inferenceSamples = results
      .map((item) => item.inference_time_sec)
      .filter((value) => value > 0);
    const reductionSamples = results
      .map((item) => item.token_reduction_rate)
      .filter((value): value is number => value !== null);
    const translationReductionSamples = results
      .map((item) => item.translation_token_reduction_rate)
      .filter((value): value is number => value !== null);
    const compressionReductionSamples = results
      .map((item) => item.compression_token_reduction_rate)
      .filter((value): value is number => value !== null);
    const summary: VerificationSummary = {
      completed_count: completedCount,
      failed_count: failedCount,
      average_inference_time_sec:
        inferenceSamples.length > 0
          ? roundMetric(
              inferenceSamples.reduce((sum, value) => sum + value, 0) /
                inferenceSamples.length,
            )
          : 0,
      average_token_reduction_rate:
        reductionSamples.length > 0
          ? roundMetric(
              reductionSamples.reduce((sum, value) => sum + value, 0) /
                reductionSamples.length,
            )
          : 0,
      average_translation_token_reduction_rate:
        translationReductionSamples.length > 0
          ? roundMetric(
              translationReductionSamples.reduce((sum, value) => sum + value, 0) /
                translationReductionSamples.length,
            )
          : 0,
      average_compression_token_reduction_rate:
        compressionReductionSamples.length > 0
          ? roundMetric(
              compressionReductionSamples.reduce((sum, value) => sum + value, 0) /
                compressionReductionSamples.length,
            )
          : 0,
      compression_fallback_count: results.filter((item) =>
        item.repair_actions.includes("compression_fallback_to_normalized_input")
      ).length,
      repair_action_item_count: results.filter((item) =>
        item.repair_actions.length > 0
      ).length,
      validation_failed_count: results.filter((item) =>
        item.validation_errors.length > 0
      ).length,
    };

    console.log(
      JSON.stringify(
        {
          ok: failedCount === 0,
          mode: "role1-verify-summary",
          ...summary,
        },
        null,
        2,
      ),
    );

    if (options.outputPath) {
      const absoluteOutputPath = isAbsolute(options.outputPath)
        ? options.outputPath
        : join(process.cwd(), options.outputPath);
      mkdirSync(dirname(absoluteOutputPath), { recursive: true });
      writeFileSync(
        absoluteOutputPath,
        JSON.stringify(
          {
            summary,
            run_metadata: batchResult.run_metadata,
            results,
          },
          null,
          2,
        ),
        "utf8",
      );

      console.log(
        JSON.stringify(
          {
            ok: true,
            output: absoluteOutputPath,
          },
          null,
          2,
        ),
      );
    }
  } finally {
    encoding.free();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exitCode = 1;
});
