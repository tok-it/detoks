import type { RenderContext } from "../renderer.js";
import type { PanelRegion } from "../layout-manager.js";
import type { PipelineProgressEvent, PipelineProgressStatus } from "../../../core/pipeline/types.js";
import type { ActionTimelineEvent } from "../../../core/timeline/types.js";
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

const WORK_STATE_BY_STAGE: Record<string, string> = {
  "Prompt Compiler": "Planning",
  "Task Graph Builder": "Inspecting",
  "Context Optimizer": "Inspecting",
  "Executor": "Editing",
  "State Manager": "Committing",
};

const deriveWorkState = (event: ActionTimelineEvent): string | null => {
  if (event.kind === "validation") {
    return "Validating";
  }

  if (event.kind === "file_edit") {
    return "Editing";
  }

  if (event.kind === "git_operation") {
    return event.summary.toLowerCase().includes("push") ? "Pushing" : "Committing";
  }

  if (event.kind === "tool_call" || event.kind === "tool_result") {
    const lower = event.summary.toLowerCase();
    if (lower.includes("git push")) {
      return "Pushing";
    }

    if (lower.includes("git commit") || lower.includes("git add")) {
      return "Committing";
    }

    if (lower.includes("npm run typecheck") || lower.includes("vitest") || lower.includes("npm test") || lower.includes("build")) {
      return "Validating";
    }

    return "Editing";
  }

  if (event.kind !== "stage_update") {
    return null;
  }

  if (!event.stage) {
    return event.summary;
  }

  if (event.stage === "Executor" && event.summary.includes("start")) {
    return "Editing";
  }

  if (event.stage === "Executor" && event.summary.includes("end")) {
    return "Validating";
  }

  return WORK_STATE_BY_STAGE[event.stage] ?? event.stage;
};

export class PipelineStatusPanel {
  private stages: Map<string, StageStatus> = new Map();
  private latestWorkState: string | null = null;
  private latestWorkStateDetail: string | null = null;

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
    const workState = deriveWorkState(event);
    if (!workState) {
      return;
    }

    this.latestWorkState = workState;
    this.latestWorkStateDetail = event.summary;
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
  }

  render(ctx: RenderContext, region: PanelRegion): void {
    const { screen } = ctx;
    const { usableWidth } = getContentArea(region);

    // Stage lines
    let currentRow = region.startRow;
    if (this.latestWorkState && currentRow < region.endRow) {
      const detail = this.latestWorkStateDetail ? ` · ${this.latestWorkStateDetail}` : "";
      screen.cursorMoveTo(currentRow, 0);
      screen.write(`• ${this.latestWorkState}${detail}`.padEnd(usableWidth));
      currentRow += 1;
    }

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
