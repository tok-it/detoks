import {
  BatchPipelineResultSchema,
  type BatchPipelineItemResult,
  type BatchPipelineResult,
} from "../../schemas/pipeline.js";
import { compilePrompt, createRole2PromptInput } from "../prompt/compiler.js";
import { loadRole1RuntimeConfig } from "../prompt/config.js";
import type { CompilePromptOptions } from "../prompt/compiler.js";

export interface BatchProgressInfo {
  phase: "start" | "complete";
  index: number;
  current: number;
  total: number;
  raw_input: string;
  summary: string;
  result?: BatchPipelineItemResult;
}

export interface BatchPipelineOptions extends CompilePromptOptions {
  onProgress?: (info: BatchProgressInfo) => void;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function summarizeInput(rawInput: string): string {
  const singleLine = rawInput.replace(/\s+/g, " ").trim();
  if (singleLine.length <= 80) {
    return singleLine;
  }

  return `${singleLine.slice(0, 77)}...`;
}

export async function runBatchPromptPipeline(
  inputs: readonly string[],
  options: BatchPipelineOptions = {},
): Promise<BatchPipelineResult> {
  const runtimeConfig = loadRole1RuntimeConfig({
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.env ? { env: options.env } : {}),
  });
  const results = [];

  for (const [index, raw_input] of inputs.entries()) {
    const current = index + 1;
    const summary = summarizeInput(raw_input);
    options.onProgress?.({
      phase: "start",
      index,
      current,
      total: inputs.length,
      raw_input,
      summary,
    });

    try {
      const compiled = await compilePrompt(
        { raw_input },
        options,
      );
      const handoff = createRole2PromptInput(compiled);
      const validationErrors = compiled.validation_errors ?? [];

      const result: BatchPipelineItemResult = {
        index,
        raw_input,
        normalized_input: compiled.normalized_input,
        compiled_prompt: compiled.normalized_input,
        role2_handoff: handoff.compiled_prompt,
        language: compiled.language,
        inference_time_sec: compiled.inference_time_sec ?? 0,
        status: validationErrors.length > 0 ? "failed" : "completed",
        validation_errors: validationErrors,
        repair_actions: compiled.repair_actions ?? [],
        ...(compiled.debug ? { debug: compiled.debug } : {}),
      };
      results.push(result);
      options.onProgress?.({
        phase: "complete",
        index,
        current,
        total: inputs.length,
        raw_input,
        summary,
        result,
      });
    } catch (error) {
      const result: BatchPipelineItemResult = {
        index,
        raw_input,
        status: "failed",
        validation_errors: [],
        repair_actions: [],
        error: toErrorMessage(error),
      };
      results.push(result);
      options.onProgress?.({
        phase: "complete",
        index,
        current,
        total: inputs.length,
        raw_input,
        summary,
        result,
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
