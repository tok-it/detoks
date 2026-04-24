import { describe, expect, it } from "vitest";
import { formatError, formatSuccess } from "../../../../src/cli/format.js";

describe("formatSuccess", () => {
  const result = {
    ok: true,
    mode: "run" as const,
    adapter: "codex" as const,
    summary: "stub executor accepted prompt (12 chars)",
    nextAction: "connect core pipeline modules behind this boundary",
    stages: [
      { name: "Prompt Compiler", owner: "role1" as const, status: "stubbed" as const },
    ],
    rawOutput: "[stub:codex] hello detoks",
  };

  it("returns a concise success payload by default", () => {
    const formatted = JSON.parse(formatSuccess(result, false));

    expect(formatted).toEqual({
      ok: true,
      mode: "run",
      adapter: "codex",
      summary: "stub executor accepted prompt (12 chars)",
      nextAction: "connect core pipeline modules behind this boundary",
    });
    expect(formatted).not.toHaveProperty("stages");
    expect(formatted).not.toHaveProperty("rawOutput");
  });

  it("returns the full success payload in verbose mode", () => {
    expect(JSON.parse(formatSuccess(result, true))).toEqual(result);
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
