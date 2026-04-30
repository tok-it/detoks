import { describe, expect, it } from "vitest";
import {
  formatBatchSuccess,
  formatError,
  formatSessionShowHuman,
  formatSuccess,
} from "../../../../src/cli/format.js";

describe("formatSuccess", () => {
  const result = {
    ok: true,
    mode: "run" as const,
    adapter: "codex" as const,
    summary: "stub executor accepted prompt (12 chars)",
    nextAction: "connect core pipeline modules behind this boundary",
    sessionId: "test-session",
    taskRecords: [],
    stages: [
      { name: "Prompt Compiler", owner: "role1" as const, status: "stubbed" as const },
    ],
    rawOutput: "[stub:codex] hello detoks",
    promptLanguage: "en" as const,
    promptInferenceTimeSec: 0,
    promptValidationErrors: [],
    promptRepairActions: [],
  };

  it("returns a readable success template by default", () => {
    const formatted = formatSuccess(result, false);

    expect(formatted).toContain("[CODEX]");
    expect(formatted).toContain("한눈에 보기");
    expect(formatted).toContain("요약");
    expect(formatted).toContain("다음 작업");
    expect(formatted).toContain("프롬프트 분석");
    expect(formatted).toContain("파이프라인 상태");
    expect(formatted).toContain("실행 결과");
    expect(formatted).toContain("[stub:codex] hello detoks");
    expect(formatted).toContain("Prompt Compiler");
  });

  it("returns the full success payload in verbose mode", () => {
    expect(JSON.parse(formatSuccess(result, true))).toEqual(result);
  });

  it("includes token reduction metrics when present", () => {
    const tokenMetrics = {
      model: "o200k_base" as const,
      input: {
        originalTokens: 100,
        optimizedTokens: 60,
        savedTokens: 40,
        savedPercent: 40,
      },
      output: {
        originalTokens: 80,
        optimizedTokens: 20,
        savedTokens: 60,
        savedPercent: 75,
      },
    };
    const formatted = formatSuccess(
      {
        ...result,
        tokenMetrics,
      },
      false,
    );

    expect(formatted).toContain("토큰 절감");
    expect(formatted).toContain("입력");
    expect(formatted).toContain("출력");
    expect(formatted).toContain("기준");
    expect(formatted).toContain("o200k_base");
  });
});

describe("formatError", () => {
  it("returns only the error message by default", () => {
    const formatted = JSON.parse(formatError(new Error("boom"), false));

    expect(formatted).toEqual({
      ok: false,
      error: "boom",
    });
    expect(formatted).not.toHaveProperty("stack");
  });

  it("includes the stack trace in verbose mode", () => {
    const error = new Error("boom");
    const formatted = JSON.parse(formatError(error, true));

    expect(formatted.ok).toBe(false);
    expect(formatted.error).toBe("boom");
    expect(formatted.stack).toContain("Error: boom");
  });
});

describe("formatBatchSuccess", () => {
  const result = {
    run_metadata: {
      generated_at: "2026-04-24T00:00:00.000Z",
      pipeline_mode: "safe" as const,
      input_count: 2,
    },
    results: [
      { index: 0, raw_input: "a", status: "completed" as const, validation_errors: [], repair_actions: [] },
      { index: 1, raw_input: "b", status: "failed" as const, validation_errors: ["x"], repair_actions: [] },
    ],
  };

  it("returns a concise batch payload by default", () => {
    const formatted = JSON.parse(formatBatchSuccess(result, false));

    expect(formatted).toEqual({
      ok: false,
      mode: "batch",
      inputCount: 2,
      completedCount: 1,
      failedCount: 1,
    });
  });

  it("returns the full batch payload in verbose mode", () => {
    expect(JSON.parse(formatBatchSuccess(result, true))).toEqual(result);
  });
});

describe("formatSessionShowHuman", () => {
  it("renders a readable session detail summary with task previews", () => {
    const formatted = formatSessionShowHuman({
      ok: true,
      mode: "session-show",
      sessionId: "session_123",
      hasSession: true,
      mutatesState: false,
      message: "세션 session_123의 저장된 작업 결과를 불러왔습니다.",
      overview: {
        summary: "세션 요약",
        nextAction: "다음 작업을 진행하세요",
        currentTaskId: "t2",
        completedTaskCount: 1,
        taskResultCount: 2,
        updatedAt: "2026-04-27T00:00:00.000Z",
      },
      taskResults: [
        {
          taskId: "t1",
          success: true,
          summary: "첫 번째 작업 완료",
          rawOutputPreview: "[stub:codex] first output",
        },
        {
          taskId: "t2",
          success: false,
          summary: "두 번째 작업 실패",
          rawOutputPreview: "[stub:codex] second output",
        },
      ],
    });

    expect(formatted).toContain("detoks 세션 session_123");
    expect(formatted).toContain("최근 요약: 세션 요약");
    expect(formatted).toContain("다음 작업: 다음 작업을 진행하세요");
    expect(formatted).toContain("완료 1개 / 결과 2개");
    expect(formatted).toContain("첫 번째 작업 완료");
    expect(formatted).toContain("[stub:codex] second output");
  });
});
