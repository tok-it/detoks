import { describe, expect, it } from "vitest";
import {
  formatBatchSuccess,
  formatError,
  formatFailedResult,
  formatSuccess,
} from "../../../../src/cli/format.js";

const colorTty = { isTTY: true, env: { FORCE_COLOR: "1" } };

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

  it("returns a concise success payload by default", () => {
    const formatted = JSON.parse(formatSuccess(result, false));

    expect(formatted).toEqual({
      ok: true,
      mode: "run",
      adapter: "codex",
      summary: "stub executor accepted prompt (12 chars)",
      nextAction: "connect core pipeline modules behind this boundary",
      stages: [
        { name: "Prompt Compiler", owner: "role1", status: "stubbed" },
      ],
      promptLanguage: "en",
      promptInferenceTimeSec: 0,
      promptValidationErrors: [],
      promptRepairActions: [],
    });
    expect(formatted).not.toHaveProperty("rawOutput");
  });

  it("returns the full success payload in verbose mode", () => {
    expect(JSON.parse(formatSuccess(result, true))).toEqual(result);
  });

  it("styles trace helper text outside the JSON body when enabled", () => {
    const formatted = formatSuccess(
      {
        ...result,
        traceLog: {
          sessionId: "test-session",
          startTime: "2026-04-28T00:00:00.000Z",
          entries: [],
          summary: {
            totalDurationMs: 10,
            stageTimings: { PromptCompiler: 10 },
            totalMemoryMb: 12.34,
          },
        },
        traceFilePath: "local_config/trace/test-trace.json",
      },
      false,
      colorTty,
    );

    expect(formatted).toContain('"traceFile": "local_config/trace/test-trace.json"');
    expect(formatted).toContain("\x1b[1mPipeline Trace Report\x1b[0m");
    expect(formatted).toContain("\x1b[1m**Session ID**:\x1b[0m test-session");
    expect(formatted).toContain("- \x1b[1m**Total Duration**:\x1b[0m 10ms");
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

describe("formatFailedResult", () => {
  it("styles trace helper text for failed results when enabled", () => {
    const formatted = formatFailedResult(
      {
        ok: false,
        mode: "run",
        adapter: "codex",
        summary: "failed",
        nextAction: "retry",
        sessionId: "test-session",
        taskRecords: [],
        stages: [],
        rawOutput: "[stub:codex] failed",
        traceFilePath: "local_config/trace/test-trace.json",
      },
      false,
      colorTty,
    );

    expect(formatted).toContain('"error": "failed"');
    expect(formatted).toContain("\x1b[2m[Trace saved → local_config/trace/test-trace.json]\x1b[0m");
  });
});
