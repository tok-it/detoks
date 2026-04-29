import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PipelineTracer } from "../../../../../src/core/utils/PipelineTracer.js";

const originalTrace = process.env.DETOKS_TRACE;
const originalForceColor = process.env.FORCE_COLOR;
const originalNoColor = process.env.NO_COLOR;

describe("PipelineTracer", () => {
  beforeEach(() => {
    PipelineTracer.clear();
  });

  afterEach(() => {
    process.env.DETOKS_TRACE = originalTrace;
    process.env.FORCE_COLOR = originalForceColor;
    process.env.NO_COLOR = originalNoColor;
    vi.restoreAllMocks();
  });

  it("단계별 trace를 기록한다", async () => {
    const sessionId = "test-session-001";

    await PipelineTracer.trace({
      sessionId,
      stage: "PromptCompiler",
      role: "role1",
      phase: "input",
      dataType: "UserRequest",
      data: { raw_input: "파이썬으로 버블 정렬 짜줘" },
    });

    await PipelineTracer.trace({
      sessionId,
      stage: "PromptCompiler",
      role: "role1",
      phase: "output",
      dataType: "CompiledPrompt",
      data: { compressed_prompt: "Create bubble sort in Python", language: "ko" },
    });

    const log = PipelineTracer.getTrace(sessionId);
    expect(log.sessionId).toBe(sessionId);
    expect(log.entries).toHaveLength(2);
    expect(log.entries[0]?.stage).toBe("PromptCompiler");
    expect(log.entries[0]?.phase).toBe("input");
    expect(log.entries[1]?.phase).toBe("output");
  });

  it("단계 타이밍을 측정한다", () => {
    PipelineTracer.startStage("TaskGraphBuilder");
    const duration = PipelineTracer.endStage("TaskGraphBuilder");
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it("스키마 검증 실패를 기록한다", async () => {
    const { z } = await import("zod");
    const schema = z.object({ required_field: z.string() });

    await PipelineTracer.trace({
      sessionId: "test-session-002",
      stage: "PromptCompiler",
      role: "role1",
      phase: "output",
      dataType: "CompiledPrompt",
      data: { wrong_field: "오류" },
      schema,
    });

    const log = PipelineTracer.getTrace("test-session-002");
    expect(log.entries[0]?.schemaValid).toBe(false);
    expect(log.entries[0]?.schemaErrors).toBeDefined();
    expect(log.entries[0]?.schemaErrors?.length).toBeGreaterThan(0);
  });

  it("getTrace summary에 stageTimings가 포함된다", () => {
    PipelineTracer.startStage("PromptCompiler");
    PipelineTracer.endStage("PromptCompiler");
    PipelineTracer.startStage("TaskGraphBuilder");
    PipelineTracer.endStage("TaskGraphBuilder");

    const log = PipelineTracer.getTrace("any-session");
    expect(log.summary).toBeDefined();
    expect(log.summary!.stageTimings["PromptCompiler"]).toBeGreaterThanOrEqual(0);
    expect(log.summary!.stageTimings["TaskGraphBuilder"]).toBeGreaterThanOrEqual(0);
  });

  it("formatAsMarkdown이 한국어 제목과 각 단계를 포함한다", async () => {
    const sessionId = "test-session-003";

    await PipelineTracer.trace({
      sessionId,
      stage: "PromptCompiler",
      role: "role1",
      phase: "input",
      dataType: "UserRequest",
      data: { raw_input: "테스트" },
    });
    await PipelineTracer.trace({
      sessionId,
      stage: "TaskGraphBuilder",
      role: "role2.1",
      phase: "output",
      dataType: "TaskGraph",
      data: { tasks: [] },
    });

    const log = PipelineTracer.getTrace(sessionId);
    const md = PipelineTracer.formatAsMarkdown(log);

    expect(md).toContain("파이프라인 추적 보고서");
    expect(md).toContain("PromptCompiler");
    expect(md).toContain("TaskGraphBuilder");
    expect(md).toContain("role1");
    expect(md).toContain("role2.1");
  });

  it("clear() 후 entries가 비어있다", async () => {
    await PipelineTracer.trace({
      sessionId: "clear-test",
      stage: "PromptCompiler",
      role: "role1",
      phase: "input",
      dataType: "UserRequest",
      data: {},
    });
    PipelineTracer.clear();
    const log = PipelineTracer.getTrace("clear-test");
    expect(log.entries).toHaveLength(0);
  });

  it("DETOKS_TRACE=1이면 한국어 trace stderr를 출력한다", async () => {
    process.env.DETOKS_TRACE = "1";
    process.env.FORCE_COLOR = "1";
    delete process.env.NO_COLOR;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await PipelineTracer.trace({
      sessionId: "trace-live-test",
      stage: "PromptCompiler",
      role: "role1",
      phase: "input",
      dataType: "UserRequest",
      data: { raw_input: "hello" },
    });

    expect(String(errorSpy.mock.calls[0]?.[0])).toContain("[추적] PromptCompiler (role1) 입력: UserRequest");
  });
});
