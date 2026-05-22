import { describe, expect, it } from "vitest";
import type { PipelineExecutionResult } from "../../../../src/core/pipeline/types.js";
import {
  collectRunMetrics,
  countAdapterStarts,
  countExecutorSkips,
  countTimelineKind,
  evaluateAssertions,
  parseArgs,
} from "../../../../scripts/benchmark-memory-effects.js";

const makeResult = (overrides: Partial<PipelineExecutionResult> = {}): PipelineExecutionResult => ({
  ok: true,
  mode: "run",
  adapter: "codex",
  summary: "ok",
  nextAction: "done",
  stages: [],
  rawOutput: "hello output",
  sessionId: "session-1",
  taskRecords: [
    { taskId: "t1", status: "completed", rawOutput: "a" },
    { taskId: "t2", status: "completed", rawOutput: "b" },
  ],
  ...overrides,
});

describe("benchmark-memory-effects script", () => {
  it("parses adapter, output, and keep-temp args", () => {
    expect(parseArgs([
      "--adapter",
      "claude",
      "--output",
      "/tmp/report.json",
      "--keep-temp",
    ])).toEqual({
      adapter: "claude",
      output: "/tmp/report.json",
      keepTemp: true,
    });
  });

  it("counts executor starts, skips, and timeline cache events", () => {
    const result = makeResult({
      progressLog: [
        { stage: "Executor", status: "start", message: "t1", timestamp: 1 },
        { stage: "Executor", status: "skip", message: "t2", timestamp: 2 },
        { stage: "State Manager", status: "start", message: "save", timestamp: 3 },
      ],
      actionTimeline: [
        { kind: "cache_hit", source: "pipeline", summary: "hit", timestamp: 1 },
        { kind: "cache_advise", source: "pipeline", summary: "advise", timestamp: 2 },
      ],
    });

    expect(countAdapterStarts(result)).toBe(1);
    expect(countExecutorSkips(result)).toBe(1);
    expect(countTimelineKind(result, "cache_hit")).toBe(1);
    expect(countTimelineKind(result, "cache_advise")).toBe(1);
  });

  it("collects cache, RAG, and session metrics from a pipeline result", () => {
    const result = makeResult({
      progressLog: [
        { stage: "Executor", status: "start", message: "t1", timestamp: 1 },
      ],
      actionTimeline: [
        { kind: "cache_hit", source: "pipeline", summary: "hit", timestamp: 1 },
      ],
      cacheHit: {
        kind: "task",
        sourceSessionId: "prev-session",
        sourceTaskId: "t1",
        cacheAge: 1000,
        tokensSaved: 42,
      },
      tokenAccounting: {
        tokensSavedByCache: 42,
        tokensAddedByRagContext: 10,
        tokensAddedByPatternHints: 0,
        tokensAddedByCompression: 0,
        netTokensSaved: 32,
      },
      lightQuality: { ragContextInjected: true, cacheHitRate: 0.5 },
      ragContextSummary: {
        found: 2,
        injected: 1,
        skipped: 1,
        skipReason: "budget",
        items: [],
      },
      ragIndexingSummary: {
        status: "completed",
        attempted: 3,
        indexed: 3,
        skipped: 0,
      },
    });

    const metrics = collectRunMetrics("sample", result, 1234, {
      shared_context: { session_id: "session-1" },
      task_results: {},
      current_task_id: "t2",
      completed_task_ids: ["t1"],
    });

    expect(metrics).toMatchObject({
      label: "sample",
      adapterStarts: 1,
      cacheHits: 1,
      cacheHitKind: "task",
      tokensSavedByCache: 42,
      tokensAddedByRagContext: 10,
      netTokensSaved: 32,
      cacheHitRate: 0.5,
      ragFound: 2,
      ragInjected: 1,
      ragSkipped: 1,
      ragSkipReason: "budget",
      ragIndexingStatus: "completed",
      sessionTasksCompleted: 1,
      sessionCurrentTaskId: "t2",
    });
  });

  it("evaluates assertion groups", () => {
    expect(evaluateAssertions([
      { name: "a", pass: true, actual: 1, expected: "1" },
      { name: "b", pass: true, actual: 2, expected: "2" },
    ])).toBe("passed");

    expect(evaluateAssertions([
      { name: "a", pass: true, actual: 1, expected: "1" },
      { name: "b", pass: false, actual: 2, expected: "3" },
    ])).toBe("failed");
  });
});
