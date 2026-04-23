import { describe, expect, it } from "vitest";
import { executeWithAdapter } from "../../../../../src/core/executor/execute.js";

describe("executeWithAdapter", () => {
  it("routes to the codex stub adapter", async () => {
    const result = await executeWithAdapter({
      adapter: "codex",
      mode: "run",
      executionMode: "stub",
      prompt: "hello codex",
      verbose: false,
    });

    expect(result.ok).toBe(true);
    expect(result.adapter).toBe("codex");
    expect(result.rawOutput).toBe("[stub:codex] hello codex");
    expect(result.exitCode).toBe(0);
  });

  it("routes to the gemini stub adapter", async () => {
    const result = await executeWithAdapter({
      adapter: "gemini",
      mode: "run",
      executionMode: "stub",
      prompt: "hello gemini",
      verbose: true,
    });

    expect(result.ok).toBe(true);
    expect(result.adapter).toBe("gemini");
    expect(result.rawOutput).toBe("[stub:gemini] hello gemini");
    expect(result.exitCode).toBe(0);
  });

  it("uses the real execution path when requested", async () => {
    const result = await executeWithAdapter({
      adapter: "codex",
      mode: "run",
      executionMode: "real",
      prompt: "hello real codex",
      verbose: false,
    });

    expect(result.ok).toBe(true);
    expect(result.rawOutput).toBe("[stub:subprocess] codex");
    expect(result.exitCode).toBe(0);
  });
});
