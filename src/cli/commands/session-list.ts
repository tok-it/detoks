import { SessionStateManager } from "../../core/state/SessionStateManager.js";
import { deriveLastWorkSummary } from "../session-summary.js";

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
    lastWorkSummary?: string | null;
  }>;
}

export interface SessionListCommandOptions {
  includeLastWorkSummary?: boolean;
}

const loadSessionLastWorkSummary = async (sessionId: string): Promise<string | null> => {
  try {
    const state = await SessionStateManager.loadSession(sessionId);
    return deriveLastWorkSummary(state);
  } catch {
    return null;
  }
};

export const runSessionListCommand = async (
  options: SessionListCommandOptions = {},
): Promise<SessionListOutput> => {
  const sessions = await SessionStateManager.listSessions();
  const sessionCount = sessions.length;
  const includeLastWorkSummary = options.includeLastWorkSummary ?? false;
  const lastWorkSummaryBySession = includeLastWorkSummary
    ? new Map(
        await Promise.all(
          sessions.map(async (session) => [session.id, await loadSessionLastWorkSummary(session.id)] as const),
        ),
      )
    : undefined;

  return {
    ok: true,
    mode: "session-list",
    mutatesState: false,
    hasSessions: sessionCount > 0,
    sessionCount,
    message:
      sessionCount === 0
        ? "세션을 찾지 못했습니다."
        : `세션 ${sessionCount}개를 찾았습니다.`,
    sessions: sessions.map((session) => ({
      id: session.id,
      updatedAt: session.updatedAt,
      currentTaskId: session.currentTaskId,
      completedTaskCount: session.completedTaskCount,
      taskResultCount: session.taskResultCount,
      nextAction: session.nextAction,
      ...(lastWorkSummaryBySession
        ? { lastWorkSummary: lastWorkSummaryBySession.get(session.id) ?? null }
        : {}),
    })),
  };
};
