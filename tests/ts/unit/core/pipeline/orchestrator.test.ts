import { beforeEach, describe, expect, it, vi } from "vitest";
import { orchestratePipeline } from "../../../../../src/core/pipeline/orchestrator.js";
import { executeWithAdapter } from "../../../../../src/core/executor/execute.js";

vi.mock("../../../../../src/core/executor/execute.js", async () => {
  const actual = await vi.importActual<typeof import("../../../../../src/core/executor/execute.js")>(
    "../../../../../src/core/executor/execute.js",
  );

  return {
    ...actual,
    executeWithAdapter: vi.fn(actual.executeWithAdapter),
  };
});

const executeWithAdapterMock = vi.mocked(executeWithAdapter);

describe("orchestratePipeline", () => {
  beforeEach(() => {
    executeWithAdapterMock.mockClear();
  });

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
    expect(result.sessionId).toBeTypeOf("string");
    expect(result.taskRecords).toHaveLength(1);
    expect(result.taskRecords[0]!.status).toBe("completed");
    expect(result.rawOutput).toContain("[stub:codex]");
  });

  it("passes execution mode through to the executor boundary", async () => {
    executeWithAdapterMock.mockResolvedValueOnce({
      ok: true,
      adapter: "codex",
      rawOutput: "[mock-real] codex",
      exitCode: 0,
    });

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
    expect(result.rawOutput).toBe("[mock-real] codex");
    expect(executeWithAdapterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adapter: "codex",
        executionMode: "real",
      }),
    );
  });
});
