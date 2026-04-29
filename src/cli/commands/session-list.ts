import { SessionStateManager } from "../../core/state/SessionStateManager.js";

export interface SessionListOutput {
  ok: true;
  mode: "session-list";
  mutatesState: false;
  hasSessions: boolean;
  sessionCount: number;
  message: string;
  sessions: Array<{
    id: string;
    updatedAt: string | null;
    currentTaskId: string | null;
    completedTaskCount: number;
    taskResultCount: number;
    nextAction: string | null;
  }>;
}

export const runSessionListCommand = async (): Promise<SessionListOutput> => {
  const sessions = await SessionStateManager.listSessions();
  const sessionCount = sessions.length;

  return {
    ok: true,
    mode: "session-list",
    mutatesState: false,
    hasSessions: sessionCount > 0,
    sessionCount,
    message:
      sessionCount === 0
        ? "저장된 세션이 없습니다."
        : `세션 ${sessionCount}개를 찾았습니다.`,
    sessions: sessions.map((session) => ({
      id: session.id,
      updatedAt: session.updatedAt,
      currentTaskId: session.currentTaskId,
      completedTaskCount: session.completedTaskCount,
      taskResultCount: session.taskResultCount,
      nextAction: session.nextAction,
    })),
  };
};
