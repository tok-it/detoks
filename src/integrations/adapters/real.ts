import { readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import type { AdapterExecutionContext, CliAdapter } from "./interface.js";
import type { AdapterExecutionRequest, AdapterExecutionResult } from "../../core/executor/types.js";
import { createPtySubprocessRunner } from "../subprocess/runner.js";
import { createActionTimelineEvent } from "../../core/timeline/types.js";
import type {
  PtyEvent,
  PtyResult,
  TranscriptAwareSubprocessRunner,
} from "../subprocess/types.js";

const readOutputLastMessage = (path?: string): string | null => {
  if (!path) {
    return null;
  }

  try {
    const text = readFileSync(path, "utf8").trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  } finally {
    try {
      rmSync(dirname(path), { recursive: true, force: true });
    } catch {
      // Cleanup is best-effort only.
    }
  }
};

const sanitizeFinalAdapterOutput = (value: string): string =>
  value
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b[78]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();

const resolveRawOutput = (
  result: { stdout: string; stderr: string; exitCode: number; timedOut: boolean },
  outputLastMessagePath?: string,
): string => {
  const lastMessage = readOutputLastMessage(outputLastMessagePath);
  if (!result.timedOut && result.exitCode === 0 && lastMessage !== null) {
    return sanitizeFinalAdapterOutput(lastMessage);
  }

  return sanitizeFinalAdapterOutput(
    !result.timedOut && result.exitCode === 0 ? result.stdout : (result.stdout || result.stderr),
  );
};

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
      rawOutput: resolveRawOutput(result, subprocessRequest.outputLastMessagePath),
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
    rawOutput: resolveRawOutput(result, subprocessRequest.outputLastMessagePath),
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
    rawOutput: resolveRawOutput(result, subprocessRequest.outputLastMessagePath),
    exitCode: result.exitCode,
    ...(result.stderr.length > 0 ? { stderr: result.stderr } : {}),
    transcript: result.transcript,
  };
};
