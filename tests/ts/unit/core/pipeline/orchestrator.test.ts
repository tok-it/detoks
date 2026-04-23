import { describe, expect, it } from "vitest";
import { orchestratePipeline } from "../../../../../src/core/pipeline/orchestrator.js";

describe("orchestratePipeline", () => {
  it("returns the current stubbed pipeline result shape", async () => {
    const result = await orchestratePipeline({
      mode: "run",
      adapter: "codex",
      verbose: false,
      userRequest: {
        raw_input: "hello detoks",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("run");
    expect(result.adapter).toBe("codex");
    expect(result.summary).toContain("stub executor accepted prompt");
    expect(result.stages).toHaveLength(6);
    expect(result.rawOutput).toBe("[stub:codex] hello detoks");
  });
});
