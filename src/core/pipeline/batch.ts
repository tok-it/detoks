import {
  BatchPipelineResultSchema,
  type BatchPipelineResult,
} from "../../schemas/pipeline.js";
import { compilePrompt, createRole2PromptInput } from "../prompt/compiler.js";
import { loadRole1RuntimeConfig } from "../prompt/config.js";
import type { CompilePromptOptions } from "../prompt/compiler.js";

export interface BatchProgressInfo {
  current: number;
  remaining: number;
  rawInput: string;
  summary: string;
  inferenceTimeMs: number;
}

export interface BatchPipelineOptions extends CompilePromptOptions {}

export interface BatchPipelineOptionsWithProgress extends BatchPipelineOptions {
  onItemComplete?: (info: BatchProgressInfo) => void;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function summarizeProgressText(text: string, maxLength = 64): string {
  const compact = text.replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 3).trimEnd()}...`;
}

export async function runBatchPromptPipeline(
  inputs: readonly string[],
  options: BatchPipelineOptionsWithProgress = {},
): Promise<BatchPipelineResult> {
  const runtimeConfig = loadRole1RuntimeConfig({
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.env ? { env: options.env } : {}),
  });
  const results = [];

  for (const [index, raw_input] of inputs.entries()) {
    const current = index + 1;
    const remaining = inputs.length - current;

    try {
      const compiled = await compilePrompt(
        { raw_input },
        options,
      );
      const handoff = createRole2PromptInput(compiled);
      const validationErrors = compiled.validation_errors ?? [];

      results.push({
        index,
        raw_input,
        normalized_input: compiled.normalized_input,
        compiled_prompt: compiled.compressed_prompt,
        role2_handoff: handoff.compiled_prompt,
        language: compiled.language,
        inference_time_sec: compiled.inference_time_sec ?? 0,
        status: validationErrors.length > 0 ? "failed" : "completed",
        validation_errors: validationErrors,
        repair_actions: compiled.repair_actions ?? [],
        ...(compiled.debug ? { debug: compiled.debug } : {}),
      });

      options.onItemComplete?.({
        current,
        remaining,
        rawInput: raw_input,
        summary: summarizeProgressText(compiled.normalized_input ?? raw_input),
        inferenceTimeMs: Math.round((compiled.inference_time_sec ?? 0) * 1000),
      });
    } catch (error) {
      results.push({
        index,
        raw_input,
        status: "failed",
        validation_errors: [],
        repair_actions: [],
        error: toErrorMessage(error),
      });

      options.onItemComplete?.({
        current,
        remaining,
        rawInput: raw_input,
        summary: summarizeProgressText(raw_input),
        inferenceTimeMs: 0,
      });
    }
  }

  return BatchPipelineResultSchema.parse({
    run_metadata: {
      generated_at: new Date().toISOString(),
      pipeline_mode: runtimeConfig.pipelineMode,
      input_count: inputs.length,
    },
    results,
  });
}
