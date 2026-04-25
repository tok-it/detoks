import { describe, expect, it } from "vitest";
import { CodexStubAdapter } from "../../../../../src/integrations/adapters/codex/adapter.js";
import { GeminiStubAdapter } from "../../../../../src/integrations/adapters/gemini/adapter.js";
import { executeAdapterViaSubprocess } from "../../../../../src/integrations/adapters/real.js";
import { createStubSubprocessRunner } from "../../../../../src/integrations/subprocess/runner.js";

const runSubprocessBoundary = async (
  adapter: CodexStubAdapter | GeminiStubAdapter,
  request: Parameters<typeof adapter.execute>[0],
) =>
  executeAdapterViaSubprocess(adapter, request, {
    executionMode: "real",
    subprocessRunner: createStubSubprocessRunner(),
  });

describe("adapter subprocess path", () => {
  it("builds codex subprocess requests explicitly", () => {
    const adapter = new CodexStubAdapter();
    expect(
      adapter.buildSubprocessRequest({
        mode: "run",
        prompt: "hello codex",
        verbose: false,
      }),
    ).toEqual({
      command: "codex",
      args: [],
      input: "hello codex",
    });
  });

  it("builds gemini subprocess requests explicitly", () => {
    const adapter = new GeminiStubAdapter();
    expect(
      adapter.buildSubprocessRequest({
        mode: "run",
        prompt: "hello gemini",
        verbose: true,
        cwd: "/tmp",
      }),
    ).toEqual({
      command: "gemini",
      args: [],
      cwd: "/tmp",
      input: "hello gemini",
    });
  });

  it("routes a codex request through the subprocess boundary", async () => {
    const adapter = new CodexStubAdapter();
    const result = await runSubprocessBoundary(adapter, {
      mode: "run",
      prompt: "hello subprocess",
      verbose: false,
    });

    expect(result.success).toBe(true);
    expect(result.rawOutput).toBe("[stub:subprocess] codex");
    expect(result.exitCode).toBe(0);
  });

  it("routes a gemini request through the subprocess boundary", async () => {
    const adapter = new GeminiStubAdapter();
    const result = await runSubprocessBoundary(adapter, {
      mode: "run",
      prompt: "hello subprocess",
      verbose: true,
      cwd: "/tmp",
    });

    expect(result.success).toBe(true);
    expect(result.rawOutput).toBe("[stub:subprocess] gemini");
    expect(result.exitCode).toBe(0);
  });
});
