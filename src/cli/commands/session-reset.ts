import { SessionStateManager } from "../../core/state/SessionStateManager.js";

export interface SessionResetOutput {
  ok: boolean;
  mode: "session-reset";
  sessionId: string;
  reset: boolean;
  mutatesState: boolean;
  message: string;
}

export const runSessionResetCommand = async (
  sessionId: string,
): Promise<SessionResetOutput> => {
  const exists = await SessionStateManager.sessionExists(sessionId);

  if (!exists) {
    return {
      ok: false,
      mode: "session-reset",
      sessionId,
      reset: false,
      mutatesState: false,
      message: `Session ${sessionId} was not found.`,
    };
  }

  try {
    await SessionStateManager.deleteSession(sessionId);
    return {
      ok: true,
      mode: "session-reset",
      sessionId,
      reset: true,
      mutatesState: true,
      message: `Session ${sessionId} has been reset (deleted).`,
    };
  } catch (error: any) {
    return {
      ok: false,
      mode: "session-reset",
      sessionId,
      reset: false,
      mutatesState: false,
      message: `Failed to reset session ${sessionId}: ${error.message}`,
    };
  }
};
