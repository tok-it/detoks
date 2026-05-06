import type { AdapterExecutionContext, CliAdapter } from "./interface.js";
import type { AdapterExecutionRequest, AdapterExecutionResult } from "../../core/executor/types.js";
import { createPtySubprocessRunner } from "../subprocess/runner.js";
import type { PtyEvent } from "../subprocess/types.js";

export const shouldUseRealExecution = (context?: AdapterExecutionContext): boolean =>
  context?.executionMode === "real";

export const executeAdapterViaSubprocess = async (
  adapter: CliAdapter,
  request: AdapterExecutionRequest,
  context: AdapterExecutionContext,
): Promise<AdapterExecutionResult> => {
  const subprocessRequest = adapter.buildSubprocessRequest(request);
  const result = await context.subprocessRunner.run(subprocessRequest);

  return {
    success: !result.timedOut && result.exitCode === 0,
    rawOutput: (!result.timedOut && result.exitCode === 0) ? result.stdout : (result.stdout || result.stderr),
    exitCode: result.exitCode,
    ...(result.stderr.length > 0 ? { stderr: result.stderr } : {}),
  };
};

export const executeAdapterViaPtySubprocess = async (
  adapter: CliAdapter,
  request: AdapterExecutionRequest,
  context: AdapterExecutionContext,
  onPtyEvent?: (event: PtyEvent) => void,
): Promise<AdapterExecutionResult & { transcript?: any }> => {
  const subprocessRequest = adapter.buildSubprocessRequest(request);
  const ptyRunner = createPtySubprocessRunner(onPtyEvent ? { onEvent: onPtyEvent } : undefined);
  const result = await ptyRunner.runWithTranscript(subprocessRequest);

  return {
    success: !result.timedOut && result.exitCode === 0,
    rawOutput: (!result.timedOut && result.exitCode === 0) ? result.stdout : (result.stdout || result.stderr),
    exitCode: result.exitCode,
    ...(result.stderr.length > 0 ? { stderr: result.stderr } : {}),
    transcript: result.transcript,
  };
};
