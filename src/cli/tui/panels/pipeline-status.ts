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

const formatStageDuration = (durationMs: number): string => {
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
};

const STATUS_ICONS: Record<PipelineProgressStatus, string> = {
  end: glyph.done,
  error: glyph.error,
  skip: glyph.skipped,
  start: glyph.active,
  info: glyph.info,
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

      const icon = STATUS_ICONS[stageStatus.status];
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

    fillRemaining(ctx, region, currentRow);
  }
}
