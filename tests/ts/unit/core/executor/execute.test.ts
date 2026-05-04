import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeWithAdapter } from "../../../../../src/core/executor/execute.js";

const subprocessMocks = vi.hoisted(() => {
  const createStubRunner = vi.fn(() => ({
    run: vi.fn(async (request: { command: string }) => ({
      stdout: `[stub-runner:${request.command}]`,
      stderr: "",
      exitCode: 0,
      timedOut: false,
    })),
  }));

  const createRealRunner = vi.fn(() => ({
    run: vi.fn(async (request: { command: string }) => ({
      stdout: `[real-runner:${request.command}]`,
      stderr: "",
      exitCode: 0,
      timedOut: false,
    })),
  }));

  return { createStubRunner, createRealRunner };
});

vi.mock("../../../../../src/integrations/subprocess/runner.js", () => ({
  createStubSubprocessRunner: subprocessMocks.createStubRunner,
  createRealSubprocessRunner: subprocessMocks.createRealRunner,
}));

describe("executeWithAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    expect(subprocessMocks.createStubRunner).toHaveBeenCalledTimes(1);
    expect(subprocessMocks.createRealRunner).not.toHaveBeenCalled();
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
    expect(subprocessMocks.createStubRunner).toHaveBeenCalledTimes(1);
    expect(subprocessMocks.createRealRunner).not.toHaveBeenCalled();
  });

  it("routes to the claude stub adapter", async () => {
    const result = await executeWithAdapter({
      adapter: "claude",
      mode: "run",
      executionMode: "stub",
      prompt: "hello claude",
      verbose: false,
    });

    expect(result.ok).toBe(true);
    expect(result.adapter).toBe("claude");
    expect(result.rawOutput).toBe("[stub:claude] hello claude");
    expect(result.exitCode).toBe(0);
    expect(subprocessMocks.createStubRunner).toHaveBeenCalledTimes(1);
    expect(subprocessMocks.createRealRunner).not.toHaveBeenCalled();
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
    expect(result.rawOutput).toBe("[real-runner:codex]");
    expect(result.exitCode).toBe(0);
    expect(subprocessMocks.createRealRunner).toHaveBeenCalledTimes(1);
  });
});
