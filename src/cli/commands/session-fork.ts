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
      message: `원본 세션 ${sourceSessionId}을(를) 찾을 수 없습니다. 포크를 생성하지 않았습니다.`,
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
      message: `세션 ${newSessionId}이(가) 이미 존재합니다. 포크를 생성하지 않았습니다.`,
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
    message: `세션 ${sourceSessionId}이(가) ${newSessionId}(으)로 포크되었습니다.`,
    nextAction: forkedSession.next_action ?? null,
  };
};
