import { PipelineTracer } from "../core/utils/PipelineTracer.js";
import { formatTokenReductionSnapshot } from "../core/utils/tokenMetrics.js";
import { translateVisibleText } from "../core/utils/visibleText.js";
import { colors } from "./colors.js";
import type { CliBatchExecutionResult, CliExecutionResult } from "./types.js";
import type { HomeDashboardOutput, HomeSessionPreview } from "./commands/home.js";
import type { SessionListOutput } from "./commands/session-list.js";

function toPromptMetadata(result: CliExecutionResult) {
  return {
    ...(result.promptLanguage ? { promptLanguage: result.promptLanguage } : {}),
    ...(result.promptInferenceTimeSec !== undefined
      ? { promptInferenceTimeSec: result.promptInferenceTimeSec }
      : {}),
    ...(result.promptValidationErrors
      ? { promptValidationErrors: result.promptValidationErrors }
      : {}),
    ...(result.promptRepairActions
      ? { promptRepairActions: result.promptRepairActions }
      : {}),
  };
}

export const formatSuccess = (result: CliExecutionResult, verbose: boolean): string => {
  const traceSection = result.traceLog
    ? "\n\n" + PipelineTracer.formatAsMarkdown(result.traceLog)
    : result.traceFilePath
      ? `\n\n[추적 로그 저장 → ${result.traceFilePath}]`
      : "";

  if (verbose) {
    const { traceLog, ...rest } = result;
    return JSON.stringify(rest, null, 2) + traceSection;
  }

  return (
    JSON.stringify(
      {
        ok: result.ok,
        mode: result.mode,
        adapter: result.adapter,
        summary: result.summary,
        nextAction: result.nextAction,
        stages: result.stages,
        ...toPromptMetadata(result),
        ...(result.traceFilePath ? { traceFile: result.traceFilePath } : {}),
      },
      null,
      2,
    ) + traceSection
  );
};

export const formatFailedResult = (
  result: CliExecutionResult,
  verbose: boolean,
): string => {
  const traceSection = result.traceLog
    ? "\n\n" + PipelineTracer.formatAsMarkdown(result.traceLog)
    : result.traceFilePath
      ? `\n\n[추적 로그 저장 → ${result.traceFilePath}]`
      : "";

  if (verbose) {
    const { traceLog, ...rest } = result;
    return JSON.stringify(rest, null, 2) + traceSection;
  }

  return (
    JSON.stringify(
      {
        ok: result.ok,
        error: result.summary,
        stages: result.stages,
        ...(result.rawOutput ? { rawOutput: result.rawOutput } : {}),
      },
      null,
      2,
    ) + traceSection
  );
};

export const formatBatchSuccess = (
  result: CliBatchExecutionResult,
  verbose: boolean,
): string => {
  if (verbose) {
    return JSON.stringify(result, null, 2);
  }

  const completedCount = result.results.filter(
    (item) => item.status === "completed",
  ).length;
  const failedCount = result.results.length - completedCount;

  return JSON.stringify(
    {
      ok: failedCount === 0,
      mode: "batch",
      inputCount: result.run_metadata.input_count,
      completedCount,
      failedCount,
    },
    null,
    2,
  );
};

export const formatError = (error: unknown, verbose: boolean): string => {
  const message = error instanceof Error ? error.message : String(error);
  if (!verbose) {
    return JSON.stringify({ ok: false, error: message }, null, 2);
  }

  return JSON.stringify(
    {
      ok: false,
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
    },
    null,
    2,
  );
};

const formatHomeSessionPreview = (
  session: HomeSessionPreview,
  index: number,
): string => {
  const parts = [
    `${index + 1}. ${colors.boldText(session.id)}`,
    session.updatedAt ? `   ${colors.info("업데이트:")} ${session.updatedAt}` : null,
    session.currentTaskId
      ? `   ${colors.warning("현재 작업:")} ${colors.warning(session.currentTaskId)}`
      : null,
    `   ${colors.success("✓ 완료된 작업:")} ${session.completedTaskCount}`,
    `   ${colors.info("작업 결과:")} ${session.taskResultCount}`,
    session.lastWorkSummary
      ? `   ${colors.muted("최근 작업 요약:")} ${translateVisibleText(session.lastWorkSummary)}`
      : null,
    session.tokenMetrics
      ? `   ${colors.info("입력 토큰 절감:")} ${formatTokenReductionSnapshot(session.tokenMetrics.input)}`
      : null,
    session.tokenMetrics
      ? `   ${colors.info("출력 토큰 절감:")} ${formatTokenReductionSnapshot(session.tokenMetrics.output)}`
      : null,
    session.tokenMetrics
      ? `   ${colors.muted("기준:")} ${colors.muted(session.tokenMetrics.model)}`
      : null,
    session.nextAction
      ? `   ${colors.warning("다음 작업:")} ${colors.warning(translateVisibleText(session.nextAction))}`
      : null,
  ].filter((line): line is string => line !== null);

  return parts.join("\n");
};

export const formatHomeDashboard = (result: HomeDashboardOutput): string => {
  const lines = [
    colors.title("detoks 홈"),
    "",
    translateVisibleText(result.message),
    "",
  ];

  if (result.recentSessions.length > 0) {
    lines.push(colors.header("최근 세션:"));
    lines.push(
      ...result.recentSessions.flatMap((session, index) => [
        formatHomeSessionPreview(session, index),
        "",
      ]),
    );
  }

  lines.push(
    colors.header("빠른 시작:"),
    `  ${colors.muted('detoks "현재 저장소 상태를 요약해줘"')}`,
    `  ${colors.muted("detoks repl")}`,
    `  ${colors.muted("detoks session list")}`,
    `  ${colors.muted("detoks session continue <session-id>")}`,
    "",
    colors.info("팁: 전체 명령 목록은 `detoks --help`를 실행하세요."),
  );

  return lines.join("\n");
};

const formatSessionListRow = (
  session: SessionListOutput["sessions"][number],
  index: number,
): string => {
  const parts = [
    `${index + 1}. ${colors.boldText(session.id)}`,
    session.updatedAt ? `   ${colors.info("업데이트:")} ${session.updatedAt}` : null,
    session.currentTaskId
      ? `   ${colors.warning("현재 작업:")} ${colors.warning(session.currentTaskId)}`
      : null,
    `   ${colors.success("✓ 완료된 작업:")} ${session.completedTaskCount}`,
    `   ${colors.info("작업 결과:")} ${session.taskResultCount}`,
    session.lastWorkSummary
      ? `   ${colors.muted("최근 작업 요약:")} ${translateVisibleText(session.lastWorkSummary)}`
      : null,
    session.tokenMetrics
      ? `   ${colors.info("입력 토큰 절감:")} ${formatTokenReductionSnapshot(session.tokenMetrics.input)}`
      : null,
    session.tokenMetrics
      ? `   ${colors.info("출력 토큰 절감:")} ${formatTokenReductionSnapshot(session.tokenMetrics.output)}`
      : null,
    session.tokenMetrics
      ? `   ${colors.muted("기준:")} ${colors.muted(session.tokenMetrics.model)}`
      : null,
    session.nextAction
      ? `   ${colors.warning("다음 작업:")} ${colors.warning(translateVisibleText(session.nextAction))}`
      : null,
  ].filter((line): line is string => line !== null);

  return parts.join("\n");
};

export const formatSessionListHuman = (result: SessionListOutput): string => {
  const lines = [
    colors.title("detoks 세션 목록"),
    "",
    translateVisibleText(result.message),
    "",
  ];

  if (result.sessions.length > 0) {
    lines.push(colors.header("저장된 세션:"));
    lines.push(
      ...result.sessions.flatMap((session, index) => [
        formatSessionListRow(session, index),
        "",
      ]),
    );
  }

  lines.push(
    colors.header("빠른 시작:"),
    `  ${colors.muted('detoks "현재 저장소 상태를 요약해줘"')}`,
    `  ${colors.muted("detoks repl")}`,
    `  ${colors.muted("detoks session continue <session-id>")}`,
    `  ${colors.muted("detoks session list")}`,
    "",
    colors.info("팁: 각 세션의 최신 작업 요약을 보려면 --human을 추가하세요."),
  );

  return lines.join("\n");
};
