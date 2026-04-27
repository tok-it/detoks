import { SessionStateManager } from "../../core/state/SessionStateManager.js";

export interface SessionForkOutput {
  ok: boolean;
  mode: "session-fork";
  sourceSessionId: string;
  newSessionId: string;
  forked: boolean;
  mutatesState: boolean;
  message: string;
  nextAction: string | null;
}

export const runSessionForkCommand = async (
  sourceSessionId: string,
  newSessionId: string,
): Promise<SessionForkOutput> => {
  const sourceExists = await SessionStateManager.sessionExists(sourceSessionId);

  if (!sourceExists) {
    return {
      ok: false,
      mode: "session-fork",
      sourceSessionId,
      newSessionId,
      forked: false,
      mutatesState: false,
      message: `Source session ${sourceSessionId} was not found. No fork was created.`,
      nextAction: null,
    };
  }

  const targetExists = await SessionStateManager.sessionExists(newSessionId);

  if (targetExists) {
    return {
      ok: false,
      mode: "session-fork",
      sourceSessionId,
      newSessionId,
      forked: false,
      mutatesState: false,
      message: `Session ${newSessionId} already exists. No fork was created.`,
      nextAction: null,
    };
  }

  const forkedSession = await SessionStateManager.forkSession(sourceSessionId, newSessionId);

  return {
    ok: true,
    mode: "session-fork",
    sourceSessionId,
    newSessionId,
    forked: true,
    mutatesState: true,
    message: `Session ${sourceSessionId} was forked to ${newSessionId}.`,
    nextAction: forkedSession.next_action ?? null,
  };
};
