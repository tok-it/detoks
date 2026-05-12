import type { RenderContext } from "../renderer.js";
import type { PanelRegion } from "../layout-manager.js";
import type { PipelineProgressEvent, PipelineProgressStatus } from "../../../core/pipeline/types.js";
import type { ActionTimelineEvent } from "../../../core/timeline/types.js";
import { deriveActionWorkState } from "../../../core/timeline/action-timeline.js";
import { getContentArea } from "../layout-manager.js";
import { padDisplayWidth } from "../renderer.js";
import { colors } from "../../colors.js";

interface StageStatus {
  status: PipelineProgressStatus;
  message: string;
  timestamp: number;
}

const STATUS_ICONS: Record<PipelineProgressStatus, string> = {
  end: "●",
  error: "●",
  skip: "○",
  start: "●",
  info: "●",
};

const STATUS_STYLES: Record<PipelineProgressStatus, (text: string) => string> = {
  end: colors.statusBlue,
  error: colors.statusRed,
  skip: colors.info,
  start: colors.statusOrange,
  info: colors.statusOrange,
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
    // Initialize all known stages
    for (const stageName of STAGE_ORDER) {
      this.stages.set(stageName, {
        status: "start",
        message: "준비",
        timestamp: Date.now(),
      });
    }
  }

  update(event: PipelineProgressEvent): void {
    this.stages.set(event.stage, {
      status: event.status,
      message: event.message,
      timestamp: Date.now(),
    });
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
    for (const stageName of STAGE_ORDER) {
      this.stages.set(stageName, {
        status: "start",
        message: "준비",
        timestamp: Date.now(),
      });
    }
    this.latestWorkState = null;
    this.latestWorkStateDetail = null;
    this.executionStartedAt = null;
  }

  render(ctx: RenderContext, region: PanelRegion): void {
    const { screen } = ctx;
    const { usableWidth } = getContentArea(region);
    const stageStatuses = [...this.stages.values()];
    const allStagesSuccessful = stageStatuses.length > 0 && stageStatuses.every((stage) => stage.status === "end");
    const anyStageFailed = stageStatuses.some((stage) => stage.status === "error");

    // Stage lines
    let currentRow = region.startRow;
    if (currentRow < region.endRow) {
      if (this.executionStartedAt !== null) {
        const elapsedMs = Math.max(0, Date.now() - this.executionStartedAt);
        const totalSeconds = Math.floor(elapsedMs / 1000);
        const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
        const seconds = String(totalSeconds % 60).padStart(2, "0");
        const spinnerFrames = ["|", "/", "-", "\\"];
        const spinner = spinnerFrames[Math.floor(elapsedMs / 250) % spinnerFrames.length] ?? "|";
        screen.cursorMoveTo(currentRow, 0);
        screen.write(colors.statusOrange(padDisplayWidth(`● 작업 진행 중 ${spinner} ${minutes}:${seconds}`, usableWidth)));
        currentRow += 1;
      } else if (allStagesSuccessful) {
        screen.cursorMoveTo(currentRow, 0);
        screen.write(colors.statusBlue(padDisplayWidth("● ALL BLUE ✓", usableWidth)));
        currentRow += 1;
      } else if (this.latestWorkState) {
        const detail = this.latestWorkStateDetail ? ` · ${this.latestWorkStateDetail}` : "";
        const style = anyStageFailed ? colors.statusRed : colors.statusOrange;
        screen.cursorMoveTo(currentRow, 0);
        screen.write(style(padDisplayWidth(`● ${this.latestWorkState}${detail}`, usableWidth)));
        currentRow += 1;
      }
    }

    for (const stageName of STAGE_ORDER) {
      if (currentRow >= region.endRow) break;

      const stageStatus = this.stages.get(stageName);
      if (!stageStatus) continue;

      const icon = STATUS_ICONS[stageStatus.status];
      const styledLine = STATUS_STYLES[stageStatus.status](padDisplayWidth(`${icon} ${stageName}`, usableWidth));

      screen.cursorMoveTo(currentRow, 0);
      screen.write(styledLine);
      currentRow += 1;
    }

    // Fill remaining rows
    while (currentRow < region.endRow) {
      screen.cursorMoveTo(currentRow, 0);
      screen.write(" ".repeat(usableWidth));
      currentRow += 1;
    }
  }
}
