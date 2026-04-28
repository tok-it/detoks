import { describe, expect, it } from "vitest";
import { CodexStubAdapter } from "../../../../../src/integrations/adapters/codex/adapter.js";
import { GeminiStubAdapter } from "../../../../../src/integrations/adapters/gemini/adapter.js";
import { executeAdapterViaSubprocess } from "../../../../../src/integrations/adapters/real.js";
import { createStubSubprocessRunner } from "../../../../../src/integrations/subprocess/runner.js";

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
      args: [
        "exec",
        "-",
        "--sandbox",
        "workspace-write",
        "--skip-git-repo-check",
        "--color",
        "never",
      ],
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
    const result = await executeAdapterViaSubprocess(
      adapter,
      {
        mode: "run",
        prompt: "hello subprocess",
        verbose: false,
      },
      {
        executionMode: "real",
        subprocessRunner: createStubSubprocessRunner(),
      },
    );

    expect(result.success).toBe(true);
    expect(result.rawOutput).toBe(
      "[stub:subprocess] codex exec - --sandbox workspace-write --skip-git-repo-check --color never",
    );
    expect(result.exitCode).toBe(0);
  });
});
