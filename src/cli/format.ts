import { PipelineTracer } from "../core/utils/PipelineTracer.js";
import type { CliBatchExecutionResult, CliExecutionResult } from "./types.js";

function toPromptMetadata(result: CliExecutionResult) {
  return {
    ...(result.promptLanguage ? { promptLanguage: result.promptLanguage } : {}),
    ...(result.promptInferenceTimeSec !== undefined
      ? { promptInferenceTimeSec: result.promptInferenceTimeSec }
      : {}),
    ...(result.promptValidationErrors
      ? { promptValidationErrors: result.promptValidationErrors }
      : {}),
    ...(result.promptRepairActions
      ? { promptRepairActions: result.promptRepairActions }
      : {}),
  };
}

export const formatSuccess = (result: CliExecutionResult, verbose: boolean): string => {
  const traceSection = result.traceLog
    ? "\n\n" + PipelineTracer.formatAsMarkdown(result.traceLog)
    : result.traceFilePath
      ? `\n\n[Trace saved → ${result.traceFilePath}]`
      : "";

  if (verbose) {
    const { traceLog, ...rest } = result;
    return JSON.stringify(rest, null, 2) + traceSection;
  }

  return (
    JSON.stringify(
      {
        ok: result.ok,
        mode: result.mode,
        adapter: result.adapter,
        summary: result.summary,
        nextAction: result.nextAction,
        ...toPromptMetadata(result),
        ...(result.traceFilePath ? { traceFile: result.traceFilePath } : {}),
      },
      null,
      2,
    ) + traceSection
  );
};

export const formatFailedResult = (
  result: CliExecutionResult,
  verbose: boolean,
): string => {
  const traceSection = result.traceLog
    ? "\n\n" + PipelineTracer.formatAsMarkdown(result.traceLog)
    : result.traceFilePath
      ? `\n\n[Trace saved → ${result.traceFilePath}]`
      : "";

  if (verbose) {
    const { traceLog, ...rest } = result;
    return JSON.stringify(rest, null, 2) + traceSection;
  }

  return (
    JSON.stringify(
      {
        ok: result.ok,
        error: result.summary,
        ...(result.rawOutput ? { rawOutput: result.rawOutput } : {}),
      },
      null,
      2,
    ) + traceSection
  );
};

export const formatBatchSuccess = (
  result: CliBatchExecutionResult,
  verbose: boolean,
): string => {
  if (verbose) {
    return JSON.stringify(result, null, 2);
  }

  const completedCount = result.results.filter(
    (item) => item.status === "completed",
  ).length;
  const failedCount = result.results.length - completedCount;

  return JSON.stringify(
    {
      ok: failedCount === 0,
      mode: "batch",
      inputCount: result.run_metadata.input_count,
      completedCount,
      failedCount,
    },
    null,
    2,
  );
};

export const formatError = (error: unknown, verbose: boolean): string => {
  const message = error instanceof Error ? error.message : String(error);
  if (!verbose) {
    return JSON.stringify({ ok: false, error: message }, null, 2);
  }

  return JSON.stringify(
    {
      ok: false,
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
    },
    null,
    2,
  );
};
