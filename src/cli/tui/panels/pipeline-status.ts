import type { RenderContext } from "../renderer.js";
import type { PanelRegion } from "../layout-manager.js";
import type { PipelineProgressEvent, PipelineProgressStatus } from "../../../core/pipeline/types.js";
import type { ActionTimelineEvent } from "../../../core/timeline/types.js";
import { deriveActionWorkState } from "../../../core/timeline/action-timeline.js";
import { getContentArea } from "../layout-manager.js";
import { fillRemaining, writePaddedLine } from "./base.js";
import { glyph, statusColor, width as widthTokens, type Style } from "../design/tokens.js";

interface StageStatus {
  status: PipelineProgressStatus;
  message: string;
  timestamp: number;
  startedAt?: number;
  endedAt?: number;
}

interface CacheCounters {
  hit: number;
  miss: number;
  advise: number;
}

const formatStageDuration = (durationMs: number): string => {
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
};

const isZeroCacheCounters = (c: CacheCounters): boolean =>
  c.hit === 0 && c.miss === 0 && c.advise === 0;

const getStatusIcon = (status: PipelineProgressStatus): string => {
  switch (status) {
    case "end":   return glyph.done;
    case "error": return glyph.error;
    case "skip":  return glyph.skipped;
    case "start": return glyph.active;
    case "info":  return glyph.info;
  }
};

const STATUS_STYLES: Record<PipelineProgressStatus, Style> = {
  end: statusColor.pipelineDone,
  error: statusColor.error,
  skip: statusColor.info,
  start: statusColor.active,
  info: statusColor.active,
};

const STAGE_ORDER = [
  "Prompt Compiler",
  "Task Graph Builder",
  "Context Optimizer",
  "Executor",
  "State Manager",
];

export class PipelineStatusPanel {
  private stages: Map<string, StageStatus> = new Map();
  private latestWorkState: string | null = null;
  private latestWorkStateDetail: string | null = null;
  private executionStartedAt: number | null = null;
  private cacheCounters: CacheCounters = { hit: 0, miss: 0, advise: 0 };
  private latestCacheEvent: { kind: "hit" | "miss" | "advise"; summary: string } | null = null;

  constructor() {
    for (const stageName of STAGE_ORDER) {
      this.stages.set(stageName, {
        status: "start",
        message: "준비",
        timestamp: Date.now(),
      });
    }
  }

  update(event: PipelineProgressEvent): void {
    const now = Date.now();
    const prev = this.stages.get(event.stage);
    const next: StageStatus = {
      status: event.status,
      message: event.message,
      timestamp: now,
      ...(prev?.startedAt !== undefined ? { startedAt: prev.startedAt } : {}),
      ...(prev?.endedAt !== undefined ? { endedAt: prev.endedAt } : {}),
    };
    if (event.status === "start") {
      next.startedAt = now;
      delete next.endedAt;
    } else if (event.status === "end" || event.status === "error") {
      next.endedAt = now;
    }
    this.stages.set(event.stage, next);
  }

  updateActionTimelineEvent(event: ActionTimelineEvent): void {
    // Track cache lifecycle events for the cache summary line.
    if (event.kind === "cache_hit") {
      this.cacheCounters.hit += 1;
      this.latestCacheEvent = { kind: "hit", summary: event.summary };
    } else if (event.kind === "cache_miss") {
      this.cacheCounters.miss += 1;
      this.latestCacheEvent = { kind: "miss", summary: event.summary };
    } else if (event.kind === "cache_advise") {
      this.cacheCounters.advise += 1;
      this.latestCacheEvent = { kind: "advise", summary: event.summary };
    }

    const workState = deriveActionWorkState(event);
    if (!workState) {
      return;
    }

    this.latestWorkState = workState;
    this.latestWorkStateDetail = event.summary;
  }

  setExecutionClock(startedAt: number | null): void {
    this.executionStartedAt = startedAt;
  }

  reset(): void {
    const now = Date.now();
    for (const stageName of STAGE_ORDER) {
      this.stages.set(stageName, {
        status: "start",
        message: "준비",
        timestamp: now,
      });
    }
    this.latestWorkState = null;
    this.latestWorkStateDetail = null;
    this.executionStartedAt = null;
    this.cacheCounters = { hit: 0, miss: 0, advise: 0 };
    this.latestCacheEvent = null;
  }

  render(ctx: RenderContext, region: PanelRegion): void {
    const { usableWidth } = getContentArea(region);
    const stageStatuses = [...this.stages.values()];
    const allStagesSuccessful = stageStatuses.length > 0 && stageStatuses.every((stage) => stage.status === "end");
    const anyStageFailed = stageStatuses.some((stage) => stage.status === "error");

    let currentRow = region.startRow;
    if (currentRow < region.endRow) {
      if (this.executionStartedAt !== null) {
        const elapsedMs = Math.max(0, Date.now() - this.executionStartedAt);
        const totalSeconds = Math.floor(elapsedMs / 1000);
        const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
        const seconds = String(totalSeconds % 60).padStart(2, "0");
        const spinnerFrames = glyph.spinner;
        const spinner = spinnerFrames[Math.floor(elapsedMs / widthTokens.spinnerFrameMs) % spinnerFrames.length] ?? spinnerFrames[0];
        writePaddedLine(
          ctx,
          currentRow,
          `${glyph.active} 작업 진행 중 ${spinner} ${minutes}:${seconds}`,
          usableWidth,
          statusColor.active,
        );
        currentRow += 1;
      } else if (allStagesSuccessful) {
        writePaddedLine(
          ctx,
          currentRow,
          `${glyph.done} ALL BLUE ${glyph.success}`,
          usableWidth,
          statusColor.pipelineDone,
        );
        currentRow += 1;
      } else if (this.latestWorkState) {
        const detail = this.latestWorkStateDetail ? ` · ${this.latestWorkStateDetail}` : "";
        const style = anyStageFailed ? statusColor.error : statusColor.active;
        writePaddedLine(
          ctx,
          currentRow,
          `${glyph.active} ${this.latestWorkState}${detail}`,
          usableWidth,
          style,
        );
        currentRow += 1;
      }
    }

    for (const stageName of STAGE_ORDER) {
      if (currentRow >= region.endRow) break;

      const stageStatus = this.stages.get(stageName);
      if (!stageStatus) continue;

      const icon = getStatusIcon(stageStatus.status);
      const durationLabel = stageStatus.startedAt !== undefined && stageStatus.endedAt !== undefined
        ? `  ${formatStageDuration(stageStatus.endedAt - stageStatus.startedAt)}`
        : "";
      writePaddedLine(
        ctx,
        currentRow,
        `${icon} ${stageName}${durationLabel}`,
        usableWidth,
        STATUS_STYLES[stageStatus.status],
      );
      currentRow += 1;
    }

    // Cache summary line — only render when at least one cache event was seen.
    if (currentRow < region.endRow && !isZeroCacheCounters(this.cacheCounters)) {
      const c = this.cacheCounters;
      const parts: string[] = [];
      if (c.hit > 0) parts.push(`${glyph.cacheHit} ${c.hit} hit`);
      if (c.miss > 0) parts.push(`${glyph.cacheMiss} ${c.miss} miss`);
      if (c.advise > 0) parts.push(`${glyph.cacheAdvise} ${c.advise} advise`);
      const summary = `캐시  ${parts.join("  ")}`;
      writePaddedLine(ctx, currentRow, summary, usableWidth, statusColor.muted);
      currentRow += 1;
    }

    fillRemaining(ctx, region, currentRow);
  }
}
