import { SessionStateManager } from "../../core/state/SessionStateManager.js";
import {
  deriveLastWorkSummary,
  deriveTokenMetricsSummary,
} from "../session-summary.js";
import type { TokenMetricsSnapshot } from "../../core/utils/tokenMetrics.js";

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
    tokenMetrics?: TokenMetricsSnapshot | null;
  }>;
}

export interface SessionListCommandOptions {
  includeLastWorkSummary?: boolean;
}

const loadSessionInsights = async (sessionId: string): Promise<{
  lastWorkSummary: string | null;
  tokenMetrics: TokenMetricsSnapshot | null;
}> => {
  try {
    const state = await SessionStateManager.loadSession(sessionId);
    return {
      lastWorkSummary: deriveLastWorkSummary(state),
      tokenMetrics: deriveTokenMetricsSummary(state),
    };
  } catch {
    return {
      lastWorkSummary: null,
      tokenMetrics: null,
    };
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
          sessions.map(async (session) => [session.id, await loadSessionInsights(session.id)] as const),
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
        ? {
            lastWorkSummary:
              lastWorkSummaryBySession.get(session.id)?.lastWorkSummary ?? null,
            tokenMetrics:
              lastWorkSummaryBySession.get(session.id)?.tokenMetrics ?? null,
          }
        : {}),
    })),
  };
};
