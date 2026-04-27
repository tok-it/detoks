import { SessionStateManager } from "../../core/state/SessionStateManager.js";
import type { TaskExecutionRecord } from "../../core/pipeline/types.js";
import type { CliExecutionResult, NormalizedCliRequest } from "../types.js";
import { runCommand } from "./run.js";

interface SessionContinueUnavailableOutput {
  ok: true;
  mode: "session-continue";
  sessionId: string;
  canContinue: false;
  resumeStarted: false;
  mutatesState: false;
  message: string;
  nextAction: string | null;
}

interface SessionContinueResumedOutput {
  ok: boolean;
  mode: "session-continue";
  sessionId: string;
  canContinue: true;
  resumeStarted: true;
  mutatesState: true;
  message: string;
  adapter: CliExecutionResult["adapter"];
  summary: string;
  nextAction: string;
  taskRecords: TaskExecutionRecord[];
  rawOutput: string;
  compiledPrompt?: string;
  role2Handoff?: string;
  promptLanguage?: CliExecutionResult["promptLanguage"];
  promptInferenceTimeSec?: CliExecutionResult["promptInferenceTimeSec"];
  promptValidationErrors?: CliExecutionResult["promptValidationErrors"];
  promptRepairActions?: CliExecutionResult["promptRepairActions"];
  traceFilePath?: string;
}

export type SessionContinueOutput =
  | SessionContinueUnavailableOutput
  | SessionContinueResumedOutput;

export const runSessionContinueCommand = async (
  request: NormalizedCliRequest,
  executeRequest: (request: NormalizedCliRequest) => Promise<CliExecutionResult> = runCommand,
): Promise<SessionContinueOutput> => {
  const sessionId = request.userRequest.session_id ?? "";
  const exists = await SessionStateManager.sessionExists(sessionId);

  if (!exists) {
    return {
      ok: true,
      mode: "session-continue",
      sessionId,
      canContinue: false,
      resumeStarted: false,
      mutatesState: false,
      message: `Session ${sessionId} was not found. No resume was started.`,
      nextAction: null,
    };
  }

  const session = await SessionStateManager.loadSession(sessionId);
  const nextAction = session.next_action ?? null;
  const rawInput =
    typeof session.shared_context.raw_input === "string"
      ? session.shared_context.raw_input.trim()
      : "";

  if (!rawInput) {
    return {
      ok: true,
      mode: "session-continue",
      sessionId,
      canContinue: false,
      resumeStarted: false,
      mutatesState: false,
      message: `Session ${sessionId} does not have a stored raw_input. No resume was started.`,
      nextAction,
    };
  }

  const result = await executeRequest({
    ...request,
    userRequest: {
      ...request.userRequest,
      raw_input: rawInput,
      session_id: sessionId,
    },
  });

  return {
    ok: result.ok,
    mode: "session-continue",
    sessionId: result.sessionId,
    canContinue: true,
    resumeStarted: true,
    mutatesState: true,
    message: `Session ${result.sessionId} resumed using stored raw_input.`,
    adapter: result.adapter,
    summary: result.summary,
    nextAction: result.nextAction,
    taskRecords: result.taskRecords,
    rawOutput: result.rawOutput,
    ...(result.compiledPrompt ? { compiledPrompt: result.compiledPrompt } : {}),
    ...(result.role2Handoff ? { role2Handoff: result.role2Handoff } : {}),
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
    ...(result.traceFilePath ? { traceFilePath: result.traceFilePath } : {}),
  };
};
