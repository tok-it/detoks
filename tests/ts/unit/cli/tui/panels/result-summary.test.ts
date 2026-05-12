import { describe, it, expect, beforeEach, vi } from "vitest";
import { ResultSummaryPanel } from "../../../../../../src/cli/tui/panels/result-summary.js";
import type { PipelineExecutionResult } from "../../../../../../src/core/pipeline/types.js";
import type { TokenReductionSnapshot, TokenMetricsSnapshot } from "../../../../../../src/core/utils/tokenMetrics.js";
import type { ActionTimelineEvent } from "../../../../../../src/core/timeline/types.js";

const mockResult = (overrides: Partial<PipelineExecutionResult> = {}): PipelineExecutionResult => ({
  ok: true,
  mode: "repl",
  adapter: "codex",
  summary: "Test summary",
  nextAction: "Test next action",
  sessionId: "test-session",
  stages: [],
  rawOutput: "",
  taskRecords: [],
  progressLog: [],
  ...overrides,
});

const mockTokenMetrics = (overrides: Partial<TokenMetricsSnapshot> = {}): TokenMetricsSnapshot => ({
  model: "o200k_base",
  input: {
    originalTokens: 1000,
    optimizedTokens: 700,
    savedTokens: 300,
    savedPercent: 30,
  },
  output: {
    originalTokens: 500,
    optimizedTokens: 400,
    savedTokens: 100,
    savedPercent: 20,
  },
  ...overrides,
});

describe("ResultSummaryPanel", () => {
  let panel: ResultSummaryPanel;
  let mockScreen: any;
  let mockContext: any;
  let mockRegion: any;

  beforeEach(() => {
    panel = new ResultSummaryPanel();
    mockScreen = {
      cursorMoveTo: vi.fn(),
      write: vi.fn(),
    };
    mockContext = { screen: mockScreen };
    mockRegion = {
      startRow: 10,
      endRow: 25,
      columns: 80,
    };
  });

  describe("setResult", () => {
    it("stores result for rendering", () => {
      const result = mockResult();

      panel.setResult(result);
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("완료"); // Success status
      expect(output).toContain("codex");
      expect(output).toContain("test-session");
      expect(output).toContain("Test summary");
    });
  });

  describe("setExecuting", () => {
    it("shows waiting placeholder while executing", () => {
      panel.setExecuting(true);
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls.map((c: any) => c[0]).join("\n");
      expect(output).toContain("Waiting for adapter CLI to finish");
      expect(output).not.toContain("실행 결과가 아직 없습니다.");
    });

    it("clears executing state when setResult is called", () => {
      panel.setExecuting(true);
      panel.setResult(mockResult());
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls.map((c: any) => c[0]).join("\n");
      expect(output).not.toContain("Waiting for adapter CLI to finish");
      expect(output).toContain("완료");
    });

    it("clears executing state when clear is called", () => {
      panel.setExecuting(true);
      panel.clear();
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls.map((c: any) => c[0]).join("\n");
      expect(output).not.toContain("Waiting for adapter CLI to finish");
    });
  });

  describe("clear", () => {
    it("clears result data", () => {
      const result = mockResult();

      panel.setResult(result);
      panel.clear();

      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      // Should be empty
      expect(output).not.toContain("Test summary");
    });
  });

  describe("formatTokenReduction", () => {
    it("formats token reduction with savings and percentage", () => {
      const result = mockResult({
        tokenMetrics: mockTokenMetrics(),
      });

      panel.setResult(result);
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");

      // Should show original and optimized tokens
      expect(output).toContain("1000");
      expect(output).toContain("700");
      // Should show savings
      expect(output).toContain("300");
      // Should show percentage (30%)
      expect(output).toContain("30");
    });

    it("handles zero tokens gracefully", () => {
      const zeroTokens = {
        originalTokens: 0,
        optimizedTokens: 0,
        savedTokens: 0,
        savedPercent: 0,
      };

      const result = mockResult({
        tokenMetrics: {
          model: "o200k_base",
          input: zeroTokens,
          output: zeroTokens,
        },
      });

      panel.setResult(result);
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      // Should not crash and render gracefully
      expect(mockScreen.write).toHaveBeenCalled();
    });
  });

  describe("render", () => {
    it("renders empty state when no result is set", () => {
      panel.render(mockContext, mockRegion);

      const calls = mockScreen.write.mock.calls;
      expect(calls.length).toBeGreaterThan(0);

      const output = calls.map((c: any) => c[0]).join("\n");
      expect(output).toContain("실행 결과가 아직 없습니다.");
      expect(output).toContain("작업 타임라인");
      expect(output).not.toContain("완료");
      expect(output).not.toContain("실패");
    });

    it("renders result content", () => {
      const result = mockResult();

      panel.setResult(result);
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      // Should contain status or summary
      expect(output.length).toBeGreaterThan(0);
    });

    it("shows success status with checkmark", () => {
      const result = mockResult();

      panel.setResult(result);
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("✓");
      expect(output).toContain("완료");
    });

    it("shows error status with cross mark", () => {
      const result = mockResult({
        ok: false,
        summary: "Error occurred",
        nextAction: "Retry",
      });

      panel.setResult(result);
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("✗");
      expect(output).toContain("실패");
    });

    it("displays token metrics section when available", () => {
      const result = mockResult({
        tokenMetrics: mockTokenMetrics(),
      });

      panel.setResult(result);
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");

      expect(output).toContain("토큰 절감");
      expect(output).toContain("입력");
      expect(output).toContain("작업 결과 요약");
    });

    it("displays prompt token savings when only passthrough savings are available", () => {
      const result = mockResult({
        promptTokenSavings: {
          originalTokens: 120,
          optimizedTokens: 74,
          savedTokens: 46,
          savedPercent: 38.3,
        },
      });

      panel.setResult(result);
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");

      expect(output).toContain("토큰 절감");
      expect(output).toContain("입력");
      expect(output).toContain("120");
      expect(output).toContain("74");
      expect(output).not.toContain("작업 결과 요약");
    });

    it("renders the action timeline section from the recap event", () => {
      const result = mockResult({
        actionTimeline: [
          {
            kind: "turn_recap",
            source: "detoks",
            summary: "턴 종료 recap",
            timestamp: Date.now(),
            details: [
              "요약: 1개 작업을 모두 완료했습니다",
              "다음 작업: 파이프라인이 완료되었습니다.",
            ],
          } as ActionTimelineEvent,
        ],
      });

      panel.setResult(result);
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");

      expect(output).toContain("작업 타임라인");
      expect(output).toContain("턴 종료 recap");
      expect(output).toContain("파이프라인이 완료되었습니다.");
    });

    it("omits token metrics section when not available", () => {
      const result = mockResult();

      panel.setResult(result);
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");

      expect(output).not.toContain("토큰 절감");
    });

    it("truncates long lines with ellipsis", () => {
      const longSummary = "x".repeat(100);
      const result = mockResult({
        summary: longSummary,
      });

      panel.setResult(result);
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");

      // Should have ellipsis
      expect(output).toContain("...");
    });

    it("respects region boundaries", () => {
      const result = mockResult();

      panel.setResult(result);
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      // Verify cursor moves are within bounds
      const cursorCalls = mockScreen.cursorMoveTo.mock.calls;
      cursorCalls.forEach((call: any) => {
        const [row] = call;
        expect(row).toBeGreaterThanOrEqual(mockRegion.startRow);
        expect(row).toBeLessThan(mockRegion.endRow);
      });
    });

    it("fills remaining rows with blank space", () => {
      const result = mockResult({
        summary: "Short",
      });

      panel.setResult(result);
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const calls = mockScreen.write.mock.calls;
      // Should fill most of the region (may leave last row empty due to loop bounds)
      const regionHeight = mockRegion.endRow - mockRegion.startRow;
      expect(calls.length).toBeGreaterThanOrEqual(regionHeight - 1);
      expect(calls.length).toBeLessThanOrEqual(regionHeight);
    });
  });
});
