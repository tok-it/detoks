import type { RenderContext } from "../renderer.js";
import type { PanelRegion } from "../layout-manager.js";
import type {
  PipelineExecutionResult,
  RagContextDisplayItem,
  RagContextSummary,
  ResumeHintInfo,
  TaskExecutionRecord,
} from "../../../core/pipeline/types.js";
import type { TokenReductionSnapshot } from "../../../core/utils/tokenMetrics.js";
import type { CostAccounting } from "../../../core/utils/tokenAccounting.js";
import { getTurnRecapLines } from "../../../core/timeline/action-timeline.js";
import { getContentArea } from "../layout-manager.js";
import { fillRemaining, truncateByLength, writePaddedLine } from "./base.js";
import { glyph, statusColor, type Style } from "../design/tokens.js";

const RAG_SOURCE_LABEL: Record<RagContextDisplayItem["sourceType"], string> = {
  previous_request: "이전 요청",
  previous_task: "이전 task",
  previous_output: "이전 결과",
};

const RAG_SKIP_REASON_LABEL: Record<NonNullable<RagContextSummary["skipReason"]>, string> = {
  budget: "토큰 예산 초과",
  empty_content: "본문 비어있음",
  disabled: "비활성화",
  error: "오류",
};

const formatRagSummaryLine = (summary: RagContextSummary): string => {
  const parts = [`${glyph.ragInjected} ${summary.injected}개 주입`];
  if (summary.skipped > 0) {
    parts.push(`${glyph.ragSkipped} ${summary.skipped}개 스킵`);
  }
  const tail = summary.skipReason
    ? `  (스킵 사유: ${RAG_SKIP_REASON_LABEL[summary.skipReason]})`
    : "";
  return `RAG  ${summary.found}개 발견 · ${parts.join(" · ")}${tail}`;
};

const formatRagItemLine = (item: RagContextDisplayItem): string => {
  const marker = item.injected ? glyph.ragInjected : glyph.ragSkipped;
  const label = RAG_SOURCE_LABEL[item.sourceType];
  const sessionShort = item.sessionId.slice(0, 8);
  const taskFragment = item.taskId ? ` ${item.taskId}` : "";
  const preview = item.preview.replace(/\s+/g, " ").trim();
  return `  ${marker} [${item.relevance}] ${label} (${sessionShort}${taskFragment}) — ${preview}`;
};

const formatRagIndexingLines = (result: PipelineExecutionResult): StyledLine[] => {
  const summary = result.ragIndexingSummary;
  if (!summary || summary.status === "skipped") return [];

  const dbStats = summary.dbRowCount !== undefined && summary.dbSessionCount !== undefined
    ? `  · DB ${summary.dbRowCount} rows/${summary.dbSessionCount} sessions`
    : "";

  if (summary.status === "completed") {
    return [
      { text: "" },
      { text: `RAG 인덱싱  완료 · ${summary.indexed}/${summary.attempted}${dbStats}` },
    ];
  }

  if (summary.status === "partial") {
    const lines: StyledLine[] = [
      { text: "" },
      { text: `RAG 인덱싱  부분 완료 · ${summary.indexed}/${summary.attempted} · ${summary.skipped}개 스킵${dbStats}`, style: statusColor.warn },
    ];
    for (const failure of (summary.failures ?? []).slice(0, 2)) {
      lines.push({
        text: `  ${glyph.warn} ${failure.kind}${failure.taskId ? ` ${failure.taskId}` : ""} — ${failure.reason}`,
        style: statusColor.warn,
      });
    }
    if ((summary.failures?.length ?? 0) > 2) {
      lines.push({ text: `  외 ${(summary.failures?.length ?? 0) - 2}개 실패`, style: statusColor.muted });
    }
    return lines;
  }

  return [
    { text: "" },
    { text: `RAG 인덱싱  실패 (non-fatal)`, style: statusColor.error },
    ...(summary.failures?.[0]
      ? [{ text: `  ${glyph.error} ${summary.failures[0].reason}`, style: statusColor.error } satisfies StyledLine]
      : []),
  ];
};

const formatRelativeAge = (updatedAt: string, now: number = Date.now()): string => {
  const ts = Date.parse(updatedAt);
  if (isNaN(ts)) return "방금";
  const diffMs = Math.max(0, now - ts);
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return `${day}일 전`;
};

const formatResumeBannerLines = (resumeHint: ResumeHintInfo): string[] => {
  const sessionShort = resumeHint.sessionId.slice(0, 8);
  const completedCount = resumeHint.completedTaskIds.length;
  const ago = formatRelativeAge(resumeHint.updatedAt);
  return [
    `↩ Resume  미완성 세션 ${sessionShort} — 완료 ${completedCount}개, 중단 ${resumeHint.currentTaskId} (${ago})`,
    `   이어가기: /session continue ${sessionShort}`,
  ];
};

const getTaskStatusGlyph = (status: TaskExecutionRecord["status"]): string => {
  switch (status) {
    case "completed": return glyph.success;
    case "failed":    return glyph.failure;
    case "skipped":   return glyph.skipped;
  }
};

const TASK_STATUS_STYLES: Record<TaskExecutionRecord["status"], Style> = {
  completed: statusColor.success,
  failed: statusColor.error,
  skipped: statusColor.muted,
};

const TASK_STATUS_LABELS: Record<TaskExecutionRecord["status"], string> = {
  completed: "완료",
  failed: "실패",
  skipped: "스킵",
};

interface StyledLine {
  text: string;
  style?: Style;
}

const formatTaskGridLines = (records: readonly TaskExecutionRecord[]): StyledLine[] => {
  const lines: StyledLine[] = [];
  lines.push({ text: "" });
  lines.push({ text: "작업 결과" });
  for (const record of records) {
    const marker = getTaskStatusGlyph(record.status);
    const label = TASK_STATUS_LABELS[record.status];
    const blocked = record.blockedBy ? `  (blocked by ${record.blockedBy})` : "";
    lines.push({
      text: `  ${marker} ${record.taskId}  ${label}${blocked}`,
      style: TASK_STATUS_STYLES[record.status],
    });
  }
  return lines;
};

const formatUsd = (value: number): string => {
  const sign = value >= 0 ? "" : "-";
  const abs = Math.abs(value);
  if (abs < 0.01) return `${sign}$${abs.toFixed(4)}`;
  return `${sign}$${abs.toFixed(2)}`;
};

const formatCostAccountingLines = (cost: CostAccounting): string[] => [
  "",
  "비용 정산 (verbose)",
  `  캐시로 절약: ${formatUsd(cost.costSavedUsd)}  ·  RAG 추가: ${formatUsd(cost.costAddedUsd)}  ·  순절감: ${formatUsd(cost.netCostSavedUsd)}`,
];

const EMPTY_RESULT_LINES = [
  "실행 결과가 아직 없습니다.",
  "첫 실행 이후 작업 타임라인 · 다음 작업 · 사용량/압축 지표가 이 영역에 표시됩니다.",
  "",
  "이전 세션 보기: /session list  ·  특정 세션 이어가기: /session continue <id>",
] as const;

export class ResultSummaryPanel {
  private result: PipelineExecutionResult | null = null;
  private executing = false;
  private verbose = false;
  private savedTranscriptPath: string | null = null;

  setResult(result: PipelineExecutionResult): void {
    this.result = result;
    this.executing = false;
  }

  setExecuting(active: boolean): void {
    this.executing = active;
  }

  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }

  setSavedTranscriptPath(path: string | null): void {
    this.savedTranscriptPath = path;
  }

  clear(): void {
    this.result = null;
    this.executing = false;
    this.savedTranscriptPath = null;
  }

  private formatTokenReduction(tokens: TokenReductionSnapshot): string {
    const saved = Math.max(0, tokens.originalTokens - tokens.optimizedTokens);
    const percent = tokens.originalTokens > 0
      ? ((saved / tokens.originalTokens) * 100).toFixed(1)
      : "0.0";
    return `${tokens.originalTokens}토큰 → ${tokens.optimizedTokens}토큰 (절감 ${saved}토큰, ${percent}%)`;
  }

  private extractActualTokenUsage(rawOutput: string): string | null {
    const usageMatch = /tokens used\s*\n\s*([0-9][0-9,]*)/i.exec(rawOutput);
    return usageMatch?.[1] ?? null;
  }

  getLines(): string[] {
    return this.buildStyledLines().map((line) => line.text);
  }

  private buildStyledLines(): StyledLine[] {
    if (this.executing) {
      return [{ text: "" }, { text: "  Waiting for adapter CLI to finish…" }];
    }

    if (!this.result) {
      return [];
    }

    const lines: StyledLine[] = [];

    // P1-3: Resume hint banner — top of result, prominent accent color.
    if (this.result.resumeHint) {
      for (const text of formatResumeBannerLines(this.result.resumeHint)) {
        lines.push({ text, style: statusColor.accent });
      }
      lines.push({ text: "" });
    }

    const statusIcon = this.result.ok ? glyph.success : glyph.failure;
    const statusText = this.result.ok ? "완료" : "실패";
    lines.push({
      text: `${statusIcon} ${statusText}  어댑터: ${this.result.adapter}  세션: ${this.result.sessionId}`,
      style: this.result.ok ? statusColor.success : statusColor.error,
    });

    lines.push({ text: `요약: ${this.result.summary}` });
    lines.push({ text: `다음 작업: ${this.result.nextAction}` });

    const turnRecap = [...(this.result.actionTimeline ?? [])]
      .reverse()
      .find((event) => event.kind === "turn_recap");

    if (turnRecap) {
      lines.push({ text: "" });
      lines.push({ text: "작업 타임라인" });
      for (const line of getTurnRecapLines(turnRecap)) {
        lines.push({ text: `  ${line}` });
      }
    }

    const actualUsage = this.extractActualTokenUsage(this.result.rawOutput);
    if (actualUsage !== null) {
      lines.push({ text: "" });
      lines.push({ text: "사용량" });
      lines.push({ text: `  실제 ${this.result.adapter} 사용량: ${actualUsage} tokens` });
    }

    if (this.result.tokenMetrics || this.result.promptTokenSavings) {
      lines.push({ text: "" });
      lines.push({ text: "detoks 압축 지표" });
      if (this.result.tokenMetrics) {
        lines.push({ text: `  프롬프트 압축: ${this.formatTokenReduction(this.result.tokenMetrics.input)}` });
        lines.push({ text: `  결과 요약 압축: ${this.formatTokenReduction(this.result.tokenMetrics.output)}` });
      } else if (this.result.promptTokenSavings) {
        lines.push({ text: `  프롬프트 압축: ${this.formatTokenReduction(this.result.promptTokenSavings)}` });
      }
    }

    // P1-4: Per-task status grid — styled per record status.
    if (this.result.taskRecords && this.result.taskRecords.length > 0) {
      for (const styled of formatTaskGridLines(this.result.taskRecords)) {
        lines.push(styled);
      }
    }

    for (const styled of formatRagIndexingLines(this.result)) {
      lines.push(styled);
    }

    const rag = this.result.ragContextSummary;
    if (rag && rag.found > 0) {
      lines.push({ text: "" });
      lines.push({ text: formatRagSummaryLine(rag) });
      // Show top 3 items so users can see which past sessions were pulled in.
      for (const item of rag.items.slice(0, 3)) {
        lines.push({ text: formatRagItemLine(item) });
      }
    }

    // P1-5: Verbose-only — cost accounting.
    if (this.verbose && this.result.costAccounting) {
      for (const text of formatCostAccountingLines(this.result.costAccounting)) {
        lines.push({ text, style: statusColor.muted });
      }
    }

    // P3-4: Saved transcript path (only when DETOKS_SAVE_TRANSCRIPTS=1 produced one).
    if (this.savedTranscriptPath) {
      lines.push({ text: "" });
      lines.push({
        text: `전사 저장: ${this.savedTranscriptPath}`,
        style: statusColor.muted,
      });
    }

    return lines;
  }

  render(ctx: RenderContext, region: PanelRegion): void {
    const { usableWidth } = getContentArea(region);

    const isEmptyState = this.result === null && !this.executing;
    const styledLines: StyledLine[] = isEmptyState
      ? EMPTY_RESULT_LINES.map((text) => ({ text, style: statusColor.muted }))
      : this.buildStyledLines();
    let currentRow = region.startRow;

    for (const line of styledLines) {
      if (currentRow >= region.endRow) break;

      const truncated = truncateByLength(line.text, usableWidth);
      writePaddedLine(ctx, currentRow, truncated, usableWidth, line.style);
      currentRow += 1;
    }

    fillRemaining(ctx, region, currentRow);
  }
}
