import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PipelineStatusPanel } from "../../../../../../src/cli/tui/panels/pipeline-status.js";
import { setNerdFont } from "../../../../../../src/cli/tui/design/tokens.js";
import type { PipelineProgressEvent } from "../../../../../../src/core/pipeline/types.js";
import type { ActionTimelineEvent } from "../../../../../../src/core/timeline/types.js";

const stripAnsi = (value: string): string =>
  value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "");

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

  afterEach(() => {
    vi.useRealTimers();
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
      // Should contain the completed stage indicator (blue circle)
      const output = calls.map((c: any) => c[0]).join("\n");
      expect(output).toContain("●");
      expect(output).toContain("Prompt Compiler");
      expect(stripAnsi(calls[0][0])).toHaveLength(80);
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
      expect(output).toContain("●");
      expect(output).toContain("Task Graph Builder");
      expect(stripAnsi(mockScreen.write.mock.calls[0][0])).toHaveLength(80);
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
      expect(output).toContain("○");
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
      expect(output).toContain("●");
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

      expect(output).toContain("● Editing");
      expect(output).toContain("Executor: start · Executor 실행 중");
    });

    it("derives Inspecting from read-only tool calls", () => {
      const event: ActionTimelineEvent = {
        kind: "tool_call",
        source: "adapter",
        summary: "exec: rg -n foo src",
        timestamp: Date.now(),
      };

      panel.updateActionTimelineEvent(event);
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");

      expect(output).toContain("● Inspecting");
      expect(output).toContain("rg -n foo src");
    });

    it("derives Waiting for CI after a successful git push", () => {
      const event: ActionTimelineEvent = {
        kind: "tool_result",
        source: "git",
        summary: "exit 0 · pushed",
        timestamp: Date.now(),
        rawPayload: {
          type: "item.completed",
          item: {
            type: "command_execution",
            command: "git push origin dev",
            status: "completed",
            exit_code: 0,
          },
        },
      };

      panel.updateActionTimelineEvent(event);
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");

      expect(output).toContain("● Waiting for CI");
      expect(output).toContain("exit 0 · pushed");
    });

    it("renders ALL BLUE when every stage succeeds", () => {
      for (const stage of [
        "Prompt Compiler",
        "Task Graph Builder",
        "Context Optimizer",
        "Executor",
        "State Manager",
      ] as const) {
        panel.update({
          stage,
          status: "end",
          message: `${stage} 완료`,
        });
      }

      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");

      expect(output).toContain("ALL BLUE");
      expect(output).toContain("✓");
      expect(output).toContain("● Prompt Compiler");
      expect(output).toContain("● Task Graph Builder");
    });
  });

  describe("execution clock", () => {
    it("renders a running timer and ascii spinner while execution is active", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-11T12:34:56.000Z"));

      panel.setExecutionClock(Date.now() - 65_000);
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");

      expect(output).toContain("작업 진행 중");
      expect(output).toContain("01:05");
      expect(output).toMatch(/[|/\\-]/);
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

      // Count waiting circles
      const circleCount = (output.match(/●/g) || []).length;
      expect(circleCount).toBeGreaterThan(0);

      // Shouldn't have error or success indicators
      expect(output).not.toContain("ALL BLUE");
      expect(output).not.toContain("✓");
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

  describe("stage duration display", () => {
    it("renders ms duration when a stage transitions start → end quickly", async () => {
      panel.update({ stage: "Prompt Compiler", status: "start", message: "시작" });
      // Tiny delay so endedAt > startedAt by some ms.
      await new Promise((resolve) => setTimeout(resolve, 5));
      panel.update({ stage: "Prompt Compiler", status: "end", message: "완료" });

      panel.render(mockContext, mockRegion);
      const output = mockScreen.write.mock.calls.map((c: any) => stripAnsi(c[0])).join("\n");
      expect(output).toMatch(/Prompt Compiler\s+\d+ms/);
    });

    it("does not render duration before a stage has ended", () => {
      panel.update({ stage: "Prompt Compiler", status: "start", message: "시작" });
      panel.render(mockContext, mockRegion);
      const output = mockScreen.write.mock.calls.map((c: any) => stripAnsi(c[0])).join("\n");
      const compilerLine = output.split("\n").find((l: string) => l.includes("Prompt Compiler"));
      expect(compilerLine).toBeDefined();
      expect(compilerLine).not.toMatch(/\d+ms/);
      expect(compilerLine).not.toMatch(/\d+\.\d+s/);
    });

    it("clears duration when stage restarts via update(start)", () => {
      panel.update({ stage: "Executor", status: "start", message: "1차" });
      panel.update({ stage: "Executor", status: "end", message: "1차 완료" });
      panel.update({ stage: "Executor", status: "start", message: "2차 시작" });

      panel.render(mockContext, mockRegion);
      const output = mockScreen.write.mock.calls.map((c: any) => stripAnsi(c[0])).join("\n");
      const executorLine = output.split("\n").find((l: string) => l.includes("Executor"));
      expect(executorLine).toBeDefined();
      expect(executorLine).not.toMatch(/\d+ms/);
    });
  });

  describe("cache event live stream", () => {
    const cacheEvent = (kind: "cache_hit" | "cache_miss" | "cache_advise", summary: string): ActionTimelineEvent => ({
      kind,
      source: "pipeline",
      summary,
      timestamp: Date.now(),
    });

    it("does not render cache summary line when no cache events have arrived", () => {
      panel.render(mockContext, mockRegion);
      const output = mockScreen.write.mock.calls.map((c: any) => stripAnsi(c[0])).join("\n");
      expect(output).not.toContain("캐시");
    });

    it("renders accumulated counters with hit/miss/advise glyphs", () => {
      panel.updateActionTimelineEvent(cacheEvent("cache_hit", "F1 hit"));
      panel.updateActionTimelineEvent(cacheEvent("cache_hit", "F2 hit"));
      panel.updateActionTimelineEvent(cacheEvent("cache_miss", "F2 miss"));
      panel.updateActionTimelineEvent(cacheEvent("cache_advise", "F1 advise"));
      panel.render(mockContext, mockRegion);
      const output = mockScreen.write.mock.calls.map((c: any) => stripAnsi(c[0])).join("\n");
      expect(output).toContain("캐시");
      expect(output).toContain("▣ 2 hit");
      expect(output).toContain("▢ 1 miss");
      expect(output).toContain("⚠ 1 advise");
    });

    it("omits zero-count categories from the summary", () => {
      panel.updateActionTimelineEvent(cacheEvent("cache_hit", "F1 hit"));
      panel.render(mockContext, mockRegion);
      const output = mockScreen.write.mock.calls.map((c: any) => stripAnsi(c[0])).join("\n");
      expect(output).toContain("▣ 1 hit");
      expect(output).not.toContain("0 miss");
      expect(output).not.toContain("0 advise");
    });

    it("clears cache counters on reset", () => {
      panel.updateActionTimelineEvent(cacheEvent("cache_hit", "F1 hit"));
      panel.reset();
      panel.render(mockContext, mockRegion);
      const output = mockScreen.write.mock.calls.map((c: any) => stripAnsi(c[0])).join("\n");
      expect(output).not.toContain("캐시");
    });
  });

  describe("nerd font glyph integration", () => {
    afterEach(() => {
      setNerdFont(false);
    });

    it("uses default glyphs when nerd font is off", () => {
      setNerdFont(false);
      const event: PipelineProgressEvent = { stage: "Executor", status: "end", message: "완료" };
      panel.update(event);
      panel.render(mockContext, mockRegion);
      const output = mockScreen.write.mock.calls.map((c: any) => stripAnsi(c[0])).join("");
      expect(output).toContain("●");
    });

    it("uses nerd font glyphs when nerd font is on", () => {
      setNerdFont(true);
      const event: PipelineProgressEvent = { stage: "Executor", status: "end", message: "완료" };
      panel.update(event);
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);
      const output = mockScreen.write.mock.calls.map((c: any) => stripAnsi(c[0])).join("");
      expect(output).not.toContain("●");
      expect(output).toContain("Executor");
    });

    it("switching nerd font mid-session changes subsequent renders", () => {
      const event: PipelineProgressEvent = { stage: "Executor", status: "end", message: "완료" };
      panel.update(event);

      setNerdFont(false);
      panel.render(mockContext, mockRegion);
      const defaultOutput = mockScreen.write.mock.calls.map((c: any) => stripAnsi(c[0])).join("");

      mockScreen.write.mockClear();
      setNerdFont(true);
      panel.render(mockContext, mockRegion);
      const nerdOutput = mockScreen.write.mock.calls.map((c: any) => stripAnsi(c[0])).join("");

      expect(defaultOutput).toContain("●");
      expect(nerdOutput).not.toContain("●");
    });
  });
});
