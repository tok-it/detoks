import type { CliBatchExecutionResult, CliExecutionResult } from "./types.js";

export const formatSuccess = (result: CliExecutionResult, verbose: boolean): string => {
  if (verbose) {
    return JSON.stringify(result, null, 2);
  }

  return JSON.stringify(
    {
      ok: result.ok,
      mode: result.mode,
      adapter: result.adapter,
      summary: result.summary,
      nextAction: result.nextAction,
    },
    null,
    2,
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
