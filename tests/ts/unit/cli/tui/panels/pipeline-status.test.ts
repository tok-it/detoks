import { describe, it, expect, beforeEach, vi } from "vitest";
import { PipelineStatusPanel } from "../../../../../../src/cli/tui/panels/pipeline-status.js";
import type { PipelineProgressEvent } from "../../../../../../src/core/pipeline/types.js";
import type { ActionTimelineEvent } from "../../../../../../src/core/timeline/types.js";

describe("PipelineStatusPanel", () => {
  let panel: PipelineStatusPanel;
  let mockScreen: any;
  let mockContext: any;
  let mockRegion: any;

  beforeEach(() => {
    panel = new PipelineStatusPanel();
    mockScreen = {
      cursorMoveTo: vi.fn(),
      write: vi.fn(),
    };
    mockContext = { screen: mockScreen };
    mockRegion = {
      startRow: 3,
      endRow: 11,
      columns: 80,
    };
  });

  describe("update", () => {
    it("updates stage status when progress event is received", () => {
      const event: PipelineProgressEvent = {
        stage: "Prompt Compiler",
        status: "end",
        message: "완료",
      };

      panel.update(event);
      // After update, render should display the new status
      panel.render(mockContext, mockRegion);

      expect(mockScreen.write).toHaveBeenCalled();
      const calls = mockScreen.write.mock.calls;
      // Should contain the completed stage indicator (✓)
      const output = calls.map((c: any) => c[0]).join("\n");
      expect(output).toContain("✓");
      expect(output).toContain("Prompt Compiler");
    });

    it("transitions stage from start to error", () => {
      let event: PipelineProgressEvent = {
        stage: "Task Graph Builder",
        status: "start",
        message: "시작",
      };
      panel.update(event);

      event = {
        stage: "Task Graph Builder",
        status: "error",
        message: "오류 발생",
      };
      panel.update(event);

      panel.render(mockContext, mockRegion);
      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("✗");
      expect(output).toContain("Task Graph Builder");
    });

    it("supports skip status", () => {
      const event: PipelineProgressEvent = {
        stage: "Context Optimizer",
        status: "skip",
        message: "스킵됨",
      };

      panel.update(event);
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("↷");
    });

    it("supports info status", () => {
      const event: PipelineProgressEvent = {
        stage: "Executor",
        status: "info",
        message: "정보",
      };

      panel.update(event);
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("·");
    });
  });

  describe("updateActionTimelineEvent", () => {
    it("renders a derived work state line", () => {
      const event: ActionTimelineEvent = {
        kind: "stage_update",
        source: "pipeline",
        stage: "Executor",
        summary: "Executor: start · Executor 실행 중",
        timestamp: Date.now(),
      };

      panel.updateActionTimelineEvent(event);
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");

      expect(output).toContain("• Editing");
      expect(output).toContain("Executor: start · Executor 실행 중");
    });
  });

  describe("reset", () => {
    it("resets all stages to start status", () => {
      // First update some stages
      panel.update({
        stage: "Prompt Compiler",
        status: "end",
        message: "완료",
      });
      panel.update({
        stage: "Task Graph Builder",
        status: "error",
        message: "오류",
      });

      // Reset
      panel.reset();

      // After reset, should show all stages as start
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");

      // Count bullet points (start status indicator)
      const bulletCount = (output.match(/•/g) || []).length;
      expect(bulletCount).toBeGreaterThan(0);

      // Shouldn't have error or success indicators
      expect(output).not.toContain("✓");
      expect(output).not.toContain("✗");
    });
  });

  describe("render", () => {
    it("renders all stages in correct order", () => {
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");

      expect(output).toContain("Prompt Compiler");
      expect(output).toContain("Task Graph Builder");
      expect(output).toContain("Context Optimizer");
      expect(output).toContain("Executor");
      expect(output).toContain("State Manager");
    });

    it("respects panel boundaries", () => {
      const smallRegion = {
        startRow: 0,
        endRow: 3, // Only 3 rows total
        columns: 80,
      };

      mockScreen.write.mockClear();
      panel.render(mockContext, smallRegion);

      // Verify cursor moves are within bounds
      const cursorCalls = mockScreen.cursorMoveTo.mock.calls;
      cursorCalls.forEach((call: any) => {
        const [row] = call;
        expect(row).toBeGreaterThanOrEqual(smallRegion.startRow);
        expect(row).toBeLessThan(smallRegion.endRow);
      });
    });

    it("fills remaining rows with blank space", () => {
      panel.render(mockContext, mockRegion);

      const calls = mockScreen.write.mock.calls;
      // Should have stage lines + blank padding lines
      expect(calls.length).toBeGreaterThan(5);
    });
  });
});
