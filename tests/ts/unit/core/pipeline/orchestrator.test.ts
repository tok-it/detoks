import { describe, expect, it } from "vitest";
import { orchestratePipeline } from "../../../../../src/core/pipeline/orchestrator.js";

describe("orchestratePipeline", () => {
  it("executes task graph and returns structured result", async () => {
    const result = await orchestratePipeline({
      mode: "run",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      userRequest: {
        raw_input: "hello detoks",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("run");
    expect(result.adapter).toBe("codex");
    expect(result.summary).toBe("All 1 task(s) completed");
    expect(result.stages).toHaveLength(5);
    expect(result.stages[0]!.status).toBe("completed");
    expect(result.sessionId).toBeTypeOf("string");
    expect(result.taskRecords).toHaveLength(1);
    expect(result.taskRecords[0]!.status).toBe("completed");
    expect(result.rawOutput).toContain("[stub:codex]");
  });

  it("passes execution mode through to the executor boundary", async () => {
    const result = await orchestratePipeline({
      mode: "run",
      adapter: "codex",
      executionMode: "real",
      verbose: false,
      userRequest: {
        raw_input: "hello detoks",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.rawOutput).toBe("[stub:subprocess] codex");
  });
});
