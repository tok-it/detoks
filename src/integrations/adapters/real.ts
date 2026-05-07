import type { AdapterExecutionContext, CliAdapter } from "./interface.js";
import type { AdapterExecutionRequest, AdapterExecutionResult } from "../../core/executor/types.js";
import { createPtySubprocessRunner } from "../subprocess/runner.js";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
  const codexArtifacts = adapter.target === "codex"
    ? (() => {
        const tempDir = mkdtempSync(join(tmpdir(), "detoks-codex-"));
        const outputPath = join(tempDir, "last-message.txt");

        return {
          request: {
            ...subprocessRequest,
            args: [
              ...subprocessRequest.args,
              "--json",
              "--output-last-message",
              outputPath,
            ],
          },
          outputPath,
          cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
        };
      })()
    : null;
  const effectiveRequest = codexArtifacts?.request ?? subprocessRequest;
  const resolveRawOutput = (result: { stdout: string; stderr: string; exitCode: number; timedOut: boolean }): string => {
    const codexLastMessage = codexArtifacts
      ? (() => {
          try {
            const text = readFileSync(codexArtifacts.outputPath, "utf8").trim();
            return text.length > 0 ? text : undefined;
          } catch {
            return undefined;
          }
        })()
      : undefined;

    return (
      codexLastMessage ??
      ((!result.timedOut && result.exitCode === 0) ? result.stdout : (result.stdout || result.stderr))
    );
  };

  const transcriptAwareRunner = context.subprocessRunner as TranscriptAwareSubprocessRunner;
  try {
    if (typeof transcriptAwareRunner.runWithTranscript === "function") {
      const result = await transcriptAwareRunner.runWithTranscript(effectiveRequest);

      return {
        success: !result.timedOut && result.exitCode === 0,
        rawOutput: resolveRawOutput(result),
        exitCode: result.exitCode,
        ...(result.stderr.length > 0 ? { stderr: result.stderr } : {}),
        transcript: result.transcript,
      };
    }

    const result = await context.subprocessRunner.run(effectiveRequest);

    return {
      success: !result.timedOut && result.exitCode === 0,
      rawOutput: resolveRawOutput(result),
      exitCode: result.exitCode,
      ...(result.stderr.length > 0 ? { stderr: result.stderr } : {}),
    };
  } finally {
    codexArtifacts?.cleanup();
  }
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
