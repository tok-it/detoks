import { SessionStateManager } from "../../core/state/SessionStateManager.js";
import {
  deriveSessionResumeOverview,
  deriveSessionTaskLogEntries,
  type SessionResumeOverview,
  type SessionTaskLogEntry,
} from "../session-summary.js";

export interface SessionShowUnavailableOutput {
  ok: true;
  mode: "session-show";
  sessionId: string;
  hasSession: false;
  mutatesState: false;
  message: string;
  overview: null;
  taskResults: [];
}

export interface SessionShowAvailableOutput {
  ok: true;
  mode: "session-show";
  sessionId: string;
  hasSession: true;
  mutatesState: false;
  message: string;
  overview: SessionResumeOverview;
  taskResults: SessionTaskLogEntry[];
}

export type SessionShowOutput =
  | SessionShowUnavailableOutput
  | SessionShowAvailableOutput;

export interface SessionShowCommandOptions {
  includeRawOutput?: boolean;
}

export const runSessionShowCommand = async (
  sessionId: string,
  options: SessionShowCommandOptions = {},
): Promise<SessionShowOutput> => {
  const exists = await SessionStateManager.sessionExists(sessionId);
  if (!exists) {
    return {
      ok: true,
      mode: "session-show",
      sessionId,
      hasSession: false,
      mutatesState: false,
      message: `세션 ${sessionId}를 찾지 못했습니다.`,
      overview: null,
      taskResults: [],
    };
  }

  const state = await SessionStateManager.loadSession(sessionId);
  return {
    ok: true,
    mode: "session-show",
    sessionId,
    hasSession: true,
    mutatesState: false,
    message: `세션 ${sessionId}의 저장된 작업 결과를 불러왔습니다.`,
    overview: deriveSessionResumeOverview(state),
    taskResults: deriveSessionTaskLogEntries(state, {
      includeRawOutput: options.includeRawOutput ?? false,
    }),
  };
};
