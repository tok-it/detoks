import { SessionStateManager } from "../../core/state/SessionStateManager.js";

export interface SessionContinueOutput {
  ok: true;
  mode: "session-continue";
  sessionId: string;
  canContinue: boolean;
  resumeStarted: false;
  mutatesState: false;
  message: string;
  nextAction: string | null;
}

export const runSessionContinueCommand = async (
  sessionId: string,
): Promise<SessionContinueOutput> => {
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

  return {
    ok: true,
    mode: "session-continue",
    sessionId,
    canContinue: true,
    resumeStarted: false,
    mutatesState: false,
    message: `Session ${sessionId} is ready to continue. No resume was started in preflight mode.`,
    nextAction,
  };
};
