import { SessionStateManager } from "../../core/state/SessionStateManager.js";
import {
  deriveLastWorkSummary,
  deriveTokenMetricsSummary,
} from "../session-summary.js";
import type { TokenMetricsSnapshot } from "../../core/utils/tokenMetrics.js";

const RECENT_SESSION_LIMIT = 3;

export interface HomeSessionPreview {
  id: string;
  updatedAt: string | null;
  currentTaskId: string | null;
  completedTaskCount: number;
  taskResultCount: number;
  nextAction: string | null;
  lastWorkSummary: string | null;
  tokenMetrics: TokenMetricsSnapshot | null;
}

export interface HomeDashboardOutput {
  ok: true;
  mode: "home";
  sessionCount: number;
  message: string;
  recentSessions: HomeSessionPreview[];
}

const loadHomeSessionPreview = async (session: {
  id: string;
  updatedAt: string | null;
  currentTaskId: string | null;
  completedTaskCount: number;
  taskResultCount: number;
  nextAction: string | null;
}): Promise<HomeSessionPreview> => {
  try {
    const state = await SessionStateManager.loadSession(session.id);
    return {
      ...session,
      lastWorkSummary: deriveLastWorkSummary(state),
      tokenMetrics: deriveTokenMetricsSummary(state),
    };
  } catch {
    return {
      ...session,
      lastWorkSummary: null,
      tokenMetrics: null,
    };
  }
};

export const runHomeCommand = async (): Promise<HomeDashboardOutput> => {
  const sessions = await SessionStateManager.listSessions();
  const recentSessions = await Promise.all(
    sessions.slice(0, RECENT_SESSION_LIMIT).map((session) => loadHomeSessionPreview(session)),
  );

  return {
    ok: true,
    mode: "home",
    sessionCount: sessions.length,
    message:
      sessions.length === 0
        ? "아직 저장된 세션이 없습니다."
        : `저장된 세션 ${sessions.length}개를 다시 이어갈 수 있습니다.`,
    recentSessions,
  };
};
