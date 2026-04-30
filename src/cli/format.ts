import { PipelineTracer } from "../core/utils/PipelineTracer.js";
import { formatTokenReductionSnapshot } from "../core/utils/tokenMetrics.js";
import { translateVisibleText } from "../core/utils/visibleText.js";
import { colors } from "./colors.js";
import type { CliBatchExecutionResult, CliExecutionResult } from "./types.js";
import type { PipelineStageStatus } from "../core/pipeline/types.js";
import type { HomeDashboardOutput, HomeSessionPreview } from "./commands/home.js";
import type { SessionShowOutput } from "./commands/session-show.js";
import type { SessionListOutput } from "./commands/session-list.js";
import type { SessionResumeOverview, SessionTaskLogEntry } from "./session-summary.js";

function formatPromptLanguage(
  language: CliExecutionResult["promptLanguage"],
): string | null {
  if (language === "ko") return "한국어";
  if (language === "en") return "영어";
  if (language === "mixed") return "혼합";
  return null;
}

function formatStageStatus(stage: PipelineStageStatus): string {
  const icon =
    stage.status === "completed"
      ? colors.success("✓")
      : stage.status === "failed"
        ? colors.error("✗")
        : stage.status === "stubbed"
          ? colors.warning("~")
          : colors.muted("·");

  const statusLabel =
    stage.status === "completed"
      ? "완료"
      : stage.status === "failed"
        ? "실패"
        : stage.status === "stubbed"
          ? "대체 실행"
          : "준비";

  return `${icon} ${stage.name} ${colors.muted(`(${stage.owner}, ${statusLabel})`)}`;
}

function hrLine(): string {
  const width = Math.min(process.stdout.columns ?? 72, 72);
  return colors.muted("─".repeat(width));
}

function formatResultHuman(result: CliExecutionResult, ok: boolean): string {
  const adapterTag = `[${result.adapter.toUpperCase()}]`;
  const header = ok
    ? `${colors.success("✓")} ${colors.boldText(adapterTag)}`
    : `${colors.error("✗")} ${colors.boldText(adapterTag)} ${colors.error("실패")}`;

  const body = (result.rawOutput?.trim() || result.summary?.trim() || "(응답 없음)");
  const promptLanguage = formatPromptLanguage(result.promptLanguage);
  const summary = result.summary?.trim() || "요약 없음";
  const nextAction = result.nextAction?.trim() || "다음 작업 없음";
  const lines = [
    "",
    `${header} ${colors.muted(`· ${result.mode.toUpperCase()}`)}`,
    hrLine(),
    colors.header("한눈에 보기"),
    `${colors.bullet} ${colors.muted("요약")} ${translateVisibleText(summary)}`,
    `${colors.bullet} ${colors.muted("다음 작업")} ${translateVisibleText(nextAction)}`,
  ];

  if (promptLanguage || result.promptInferenceTimeSec !== undefined) {
    lines.push(
      `${colors.bullet} ${colors.muted("프롬프트 분석")} ${[
        promptLanguage ? `언어 ${promptLanguage}` : null,
        result.promptInferenceTimeSec !== undefined
          ? `추론 ${result.promptInferenceTimeSec.toFixed(3)}초`
          : null,
      ]
        .filter((item): item is string => item !== null)
        .join(" · ")}`,
    );
  }

  if (result.tokenMetrics) {
    lines.push(
      "",
      colors.header("토큰 절감"),
      `${colors.bullet} ${colors.muted("입력")} ${formatTokenReductionSnapshot(result.tokenMetrics.input)}`,
      `${colors.bullet} ${colors.muted("출력")} ${formatTokenReductionSnapshot(result.tokenMetrics.output)}`,
      `${colors.bullet} ${colors.muted("기준")} ${result.tokenMetrics.model}`,
    );
  }

  if (result.promptValidationErrors && result.promptValidationErrors.length > 0) {
    lines.push(
      "",
      colors.header("검증 경고"),
      ...result.promptValidationErrors.map(
        (message) => `${colors.warning("!")} ${translateVisibleText(message)}`,
      ),
    );
  }

  if (result.stages.length > 0) {
    lines.push(
      "",
      colors.header("파이프라인 상태"),
      ...result.stages.map((stage) => formatStageStatus(stage)),
    );
  }

  lines.push("", colors.header("실행 결과"), hrLine(), body, hrLine(), "");
  return lines.join("\n");
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

  return formatResultHuman(result, true) + traceSection;
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
        ...(result.tokenMetrics ? { tokenMetrics: result.tokenMetrics } : {}),
      },
      null,
      2,
    ) + traceSection
  );
};

export const formatReplResult = (result: CliExecutionResult, verbose: boolean): string => {
  const traceSection = result.traceLog
    ? "\n\n" + PipelineTracer.formatAsMarkdown(result.traceLog)
    : result.traceFilePath
      ? `\n\n[추적 로그 저장 → ${result.traceFilePath}]`
      : "";

  if (verbose) {
    const { traceLog, ...rest } = result;
    return JSON.stringify(rest, null, 2) + traceSection;
  }

  return formatResultHuman(result, result.ok) + traceSection;
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

export const formatSessionResumeOverview = (
  overview: SessionResumeOverview,
  sessionId: string,
): string => {
  const lines = [
    colors.title(`세션 ${sessionId} 재진입 요약`),
    "",
    overview.summary
      ? `${colors.muted("최근 요약:")} ${translateVisibleText(overview.summary)}`
      : `${colors.muted("최근 요약:")} 없음`,
    overview.nextAction
      ? `${colors.warning("다음 작업:")} ${colors.warning(translateVisibleText(overview.nextAction))}`
      : null,
    `${colors.info("진행 현황:")} 완료된 작업 ${overview.completedTaskCount}, 작업 결과 ${overview.taskResultCount}`,
    overview.currentTaskId
      ? `${colors.warning("현재 작업:")} ${colors.warning(overview.currentTaskId)}`
      : null,
    overview.updatedAt
      ? `${colors.info("업데이트:")} ${overview.updatedAt}`
      : null,
  ].filter((line): line is string => line !== null);

  return lines.join("\n");
};

const formatSessionShowTask = (
  task: SessionTaskLogEntry,
  index: number,
): string => {
  const status =
    task.success === true
      ? colors.success("성공")
      : task.success === false
        ? colors.error("실패")
        : colors.warning("상태 미상");

  const output = task.rawOutput ?? task.rawOutputPreview;

  const parts = [
    `${index + 1}. ${colors.boldText(task.taskId)}`,
    `   ${colors.info("상태:")} ${status}`,
    task.summary ? `   ${colors.muted("요약:")} ${translateVisibleText(task.summary)}` : null,
    output ? `   ${colors.muted("출력:")} ${translateVisibleText(output)}` : null,
  ].filter((line): line is string => line !== null);

  return parts.join("\n");
};

export const formatSessionShowHuman = (result: SessionShowOutput): string => {
  const lines = [
    colors.title(`detoks 세션 ${result.sessionId}`),
    "",
    translateVisibleText(result.message),
    "",
  ];

  if (!result.hasSession || !result.overview) {
    lines.push(colors.info("저장된 세션 요약이 없습니다."));
    return lines.join("\n");
  }

  lines.push(
    colors.header("세션 요약:"),
    result.overview.summary
      ? `  ${colors.muted("최근 요약:")} ${translateVisibleText(result.overview.summary)}`
      : `  ${colors.muted("최근 요약:")} 없음`,
    result.overview.nextAction
      ? `  ${colors.warning("다음 작업:")} ${colors.warning(translateVisibleText(result.overview.nextAction))}`
      : `  ${colors.warning("다음 작업:")} 없음`,
    `  ${colors.info("진행 현황:")} 완료 ${result.overview.completedTaskCount}개 / 결과 ${result.overview.taskResultCount}개`,
    result.overview.currentTaskId
      ? `  ${colors.warning("현재 작업:")} ${colors.warning(result.overview.currentTaskId)}`
      : `  ${colors.warning("현재 작업:")} 없음`,
    "",
  );
  if (result.overview.updatedAt) {
    lines.push(`  ${colors.info("업데이트:")} ${result.overview.updatedAt}`, "");
  }

  if (result.taskResults.length > 0) {
    lines.push(colors.header("저장된 작업 결과:"));
    lines.push(
      ...result.taskResults.flatMap((task, index) => [
        formatSessionShowTask(task, index),
        "",
      ]),
    );
  } else {
    lines.push(colors.info("저장된 작업 결과가 없습니다."), "");
  }

  lines.push(colors.info("팁: 전체 JSON을 보려면 --verbose를 사용하세요."));

  return lines.join("\n");
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
