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
    originalPrompt: "hello detoks",
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
    expect(formatted).toContain("stub executor accepted prompt (12 chars)");
    expect(formatted).toContain("connect core pipeline modules behind this boundary");
    expect(formatted).toContain("프롬프트 분석");
    expect(formatted).toContain("파이프라인 상태");
    expect(formatted).toContain("실행 결과");
    expect(formatted).toContain("한국어 정리");
    expect(formatted).toContain("원문 출력");
    expect(formatted).toContain("요청");
    expect(formatted).toContain("상태");
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
    expect(formatted).toContain("작업 결과 요약");
    expect(formatted).toContain("기준");
    expect(formatted).toContain("o200k_base");
  });

  it("uses compiledPrompt instead of generic pipeline summary in human output", () => {
    const formatted = formatSuccess(
      {
        ...result,
        summary: "1개 작업을 모두 완료했습니다",
        nextAction: "파이프라인이 완료되었습니다.",
        compiledPrompt: "사용자 인증 버그를 수정하고 테스트를 실행해줘",
        originalPrompt: "사용자 인증 버그를 수정하고 테스트를 실행해줘",
      },
      false,
    );

    expect(formatted).toContain("사용자 인증 버그를 수정하고 테스트를 실행해줘");
    expect(formatted).toContain("다음 작업");
    expect(formatted).toContain("없음");
    expect(formatted).not.toContain("1개 작업을 모두 완료했습니다");
  });

  it("uses failed task ids for generic failure next action", () => {
    const formatted = formatSuccess(
      {
        ...result,
        ok: false,
        summary: "1/2개 작업을 완료했습니다 — 1개 실패",
        nextAction: "실패한 작업을 수정한 뒤 다시 시도하세요.",
        originalPrompt: "실패 케이스를 재현해줘",
        taskRecords: [
          { taskId: "t1", status: "completed" as const, rawOutput: "ok" },
          { taskId: "t2", status: "failed" as const, rawOutput: "boom" },
        ],
      },
      false,
    );

    expect(formatted).toContain("t2 작업 원인을 수정한 뒤 다시 시도하세요.");
  });

  it("prefers the original Korean prompt in execution summary", () => {
    const formatted = formatSuccess(
      {
        ...result,
        originalPrompt: "로그인 오류 원인을 분석해줘",
        compiledPrompt: "Analyze the cause of the login error",
      },
      false,
    );

    expect(formatted).toContain("로그인 오류 원인을 분석해줘");
    expect(formatted).not.toContain("Analyze the cause of the login error");
  });

  it("renders readable RAG context summary without raw distance values", () => {
    const formatted = formatSuccess(
      {
        ...result,
        ragContextSummary: {
          found: 2,
          injected: 1,
          skipped: 1,
          skipReason: "budget" as const,
          items: [
            {
              sourceType: "previous_task" as const,
              sessionId: "a13f9c2b",
              taskId: "t2",
              preview: "로그인 토큰 갱신 로직 수정",
              relevance: "high" as const,
              injected: true,
            },
            {
              sourceType: "previous_request" as const,
              sessionId: "8b72d10e",
              preview: "OAuth 콜백 에러 분석",
              relevance: "medium" as const,
              injected: false,
            },
          ],
        },
        semanticContext: [
          { id: "task::a13f9c2b::t2", kind: "task" as const, session_id: "a13f9c2b", task_id: "t2", distance: 0.123 },
        ],
      },
      false,
    );

    expect(formatted).toContain("관련 과거 컨텍스트");
    expect(formatted).toContain("이전 작업 t2");
    expect(formatted).toContain("로그인 토큰 갱신 로직 수정 내용을 참고했습니다");
    expect(formatted).toContain("이전 요청");
    expect(formatted).toContain("이번 프롬프트에는 넣지 않았습니다");
    expect(formatted).toContain("관련도 높음");
    expect(formatted).toContain("관련도 중간");
    expect(formatted).toContain("미사용 이유:");
    expect(formatted).toContain("컨텍스트 예산 초과");
    expect(formatted).not.toContain("dist:");
    expect(formatted).not.toContain("0.123");
    expect(formatted).not.toContain("task::a13f9c2b::t2");
  });

  it("falls back to semanticContext when RAG display summary is absent", () => {
    const formatted = formatSuccess(
      {
        ...result,
        semanticContext: [
          { id: "task::s1::t1", kind: "task" as const, session_id: "s1", task_id: "t1", distance: 0.456 },
        ],
      },
      false,
    );

    expect(formatted).toContain("관련 과거 작업");
    expect(formatted).toContain("task::s1::t1");
    expect(formatted).toContain("dist: 0.456");
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
