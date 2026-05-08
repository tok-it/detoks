import type { AdapterExecutionContext, CliAdapter } from "./interface.js";
import type { AdapterExecutionRequest, AdapterExecutionResult } from "../../core/executor/types.js";
import { createPtySubprocessRunner } from "../subprocess/runner.js";
import { createActionTimelineEvent } from "../../core/timeline/types.js";
import type {
  PtyEvent,
  PtyResult,
  TranscriptAwareSubprocessRunner,
} from "../subprocess/types.js";

export const shouldUseRealExecution = (context?: AdapterExecutionContext): boolean =>
  context?.executionMode === "real";

export const executeAdapterViaSubprocess = async (
  adapter: CliAdapter,
  request: AdapterExecutionRequest,
  context: AdapterExecutionContext,
): Promise<AdapterExecutionResult> => {
  const subprocessRequest = adapter.buildSubprocessRequest(request);
  const emitTimelineEvent = async (
    summary: string,
    kind: "tool_call" | "tool_result",
    rawPayload?: unknown,
  ): Promise<void> => {
    if (!context.onActionTimelineEvent) {
      return;
    }

    try {
      await context.onActionTimelineEvent(
        createActionTimelineEvent({
          kind,
          source: "adapter",
          summary,
          rawPayload,
        }),
      );
    } catch {
      // Timeline hooks must never break adapter execution.
    }
  };

  const transcriptAwareRunner = context.subprocessRunner as TranscriptAwareSubprocessRunner;
  await emitTimelineEvent(
    `${adapter.target} 실행: ${subprocessRequest.command} ${subprocessRequest.args.join(" ")}`.trim(),
    "tool_call",
    {
      command: subprocessRequest.command,
      args: subprocessRequest.args,
      cwd: subprocessRequest.cwd,
    },
  );

  if (typeof transcriptAwareRunner.runWithTranscript === "function") {
    const result = await transcriptAwareRunner.runWithTranscript(subprocessRequest);
    await emitTimelineEvent(
      `${adapter.target} 완료: exit ${result.exitCode}${result.timedOut ? " (timeout)" : ""}`,
      "tool_result",
      {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
      },
    );

    return {
      success: !result.timedOut && result.exitCode === 0,
      rawOutput: !result.timedOut && result.exitCode === 0 ? result.stdout : (result.stdout || result.stderr),
      exitCode: result.exitCode,
      ...(result.stderr.length > 0 ? { stderr: result.stderr } : {}),
      transcript: result.transcript,
    };
  }

  const result = await context.subprocessRunner.run(subprocessRequest);
  await emitTimelineEvent(
    `${adapter.target} 완료: exit ${result.exitCode}${result.timedOut ? " (timeout)" : ""}`,
    "tool_result",
    {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
    },
  );

  return {
    success: !result.timedOut && result.exitCode === 0,
    rawOutput: !result.timedOut && result.exitCode === 0 ? result.stdout : (result.stdout || result.stderr),
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
