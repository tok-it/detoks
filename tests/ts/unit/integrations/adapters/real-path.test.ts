import { describe, expect, it } from "vitest";
import { CodexStubAdapter } from "../../../../../src/integrations/adapters/codex/adapter.js";
import { GeminiStubAdapter } from "../../../../../src/integrations/adapters/gemini/adapter.js";
import type { SubprocessRunner } from "../../../../../src/integrations/subprocess/types.js";

const fakeRunner: SubprocessRunner = {
  async run(request) {
    return {
      stdout: `[fake:${request.command}] ${request.input ?? ""}`,
      stderr: "",
      exitCode: request.command === "codex" ? 0 : 3,
      timedOut: false,
    };
  },
};

describe("adapter execution modes", () => {
  it("keeps codex stub execution separate from real execution", async () => {
    const adapter = new CodexStubAdapter();

    const stubResult = await adapter.execute({
      mode: "run",
      prompt: "stub prompt",
      verbose: false,
    });

    const realResult = await adapter.execute(
      {
        mode: "run",
        prompt: "real prompt",
        verbose: false,
      },
      {
        executionMode: "real",
        subprocessRunner: fakeRunner,
      },
    );

    expect(stubResult.rawOutput).toBe("[stub:codex] stub prompt");
    expect(stubResult.exitCode).toBe(0);
    expect(realResult.rawOutput).toBe("[fake:codex] real prompt");
    expect(realResult.exitCode).toBe(0);
  });

  it("keeps gemini stub execution separate from real execution", async () => {
    const adapter = new GeminiStubAdapter();

    const stubResult = await adapter.execute({
      mode: "run",
      prompt: "stub prompt",
      verbose: true,
    });

    const realResult = await adapter.execute(
      {
        mode: "run",
        prompt: "real prompt",
        verbose: true,
      },
      {
        executionMode: "real",
        subprocessRunner: fakeRunner,
      },
    );

    expect(stubResult.rawOutput).toBe("[stub:gemini] stub prompt");
    expect(stubResult.exitCode).toBe(0);
    expect(realResult.rawOutput).toBe("[fake:gemini] real prompt");
    expect(realResult.exitCode).toBe(3);
  });
});
