import type { CliExecutionResult } from "./types.js";

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
