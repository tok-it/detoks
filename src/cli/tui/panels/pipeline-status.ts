import type { RenderContext } from "../renderer.js";
import type { PanelRegion } from "../layout-manager.js";
import type { PipelineProgressEvent, PipelineProgressStatus } from "../../../core/pipeline/types.js";
import { getContentArea } from "../layout-manager.js";

interface StageStatus {
  status: PipelineProgressStatus;
  message: string;
  timestamp: number;
}

const STATUS_ICONS: Record<PipelineProgressStatus, string> = {
  end: "✓",
  error: "✗",
  skip: "↷",
  start: "•",
  info: "·",
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

  reset(): void {
    for (const stageName of STAGE_ORDER) {
      this.stages.set(stageName, {
        status: "start",
        message: "준비",
        timestamp: Date.now(),
      });
    }
  }

  render(ctx: RenderContext, region: PanelRegion): void {
    const { screen } = ctx;
    const { usableWidth } = getContentArea(region);

    // Stage lines
    let currentRow = region.startRow;
    for (const stageName of STAGE_ORDER) {
      if (currentRow >= region.endRow) break;

      const stageStatus = this.stages.get(stageName);
      if (!stageStatus) continue;

      const icon = STATUS_ICONS[stageStatus.status];
      const line = `${icon} ${stageName}`.padEnd(usableWidth);

      screen.cursorMoveTo(currentRow, 0);
      screen.write(line);
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
