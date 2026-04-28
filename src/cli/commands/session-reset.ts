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
      message: `세션 ${sessionId}을(를) 찾을 수 없습니다.`,
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
      message: `세션 ${sessionId}이(가) 초기화(삭제)되었습니다.`,
    };
  } catch (error: any) {
    return {
      ok: false,
      mode: "session-reset",
      sessionId,
      reset: false,
      mutatesState: false,
      message: `세션 ${sessionId} 초기화 실패: ${error.message}`,
    };
  }
};
