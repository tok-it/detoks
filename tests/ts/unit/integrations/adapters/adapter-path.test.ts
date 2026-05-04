import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CodexStubAdapter } from "../../../../../src/integrations/adapters/codex/adapter.js";
import { ClaudeStubAdapter } from "../../../../../src/integrations/adapters/claude/adapter.js";
import { GeminiStubAdapter } from "../../../../../src/integrations/adapters/gemini/adapter.js";
import { executeAdapterViaSubprocess } from "../../../../../src/integrations/adapters/real.js";
import { createStubSubprocessRunner } from "../../../../../src/integrations/subprocess/runner.js";
import { updateCodexReasoningEffort } from "../../../../../src/cli/config/config-manager.js";

const tempDirs: string[] = [];
let home: string;

function createTempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "detoks-codex-effort-"));
  tempDirs.push(dir);
  return dir;
}

beforeEach(() => {
  home = createTempHome();
  vi.stubEnv("HOME", home);
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }

  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("adapter subprocess path", () => {
  it("builds codex subprocess requests explicitly", () => {
    const adapter = new CodexStubAdapter();
    expect(
      adapter.buildSubprocessRequest({
        mode: "run",
        prompt: "hello codex",
        verbose: false,
        model: "gpt-5",
      }),
    ).toEqual({
      command: "codex",
      args: [
        "exec",
        "--model",
        "gpt-5",
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
        model: "gemini-2.5-pro",
        cwd: "/tmp",
      }),
    ).toEqual({
      command: "gemini",
      args: ["--model", "gemini-2.5-pro"],
      cwd: "/tmp",
      input: "hello gemini",
    });
  });

  it("builds claude subprocess requests explicitly", () => {
    const adapter = new ClaudeStubAdapter();
    expect(
      adapter.buildSubprocessRequest({
        mode: "run",
        prompt: "hello claude",
        verbose: true,
        model: "claude-sonnet-4-6",
        cwd: "/tmp",
      }),
    ).toEqual({
      command: "claude",
      args: [
        "-p",
        "--output-format",
        "text",
        "--permission-mode",
        "default",
        "--model",
        "claude-sonnet-4-6",
      ],
      cwd: "/tmp",
      input: "hello claude",
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
        model: "gpt-5",
      },
      {
        executionMode: "real",
        subprocessRunner: createStubSubprocessRunner(),
      },
    );

    expect(result.success).toBe(true);
    expect(result.rawOutput).toBe(
      "[stub:subprocess] codex exec --model gpt-5 - --sandbox workspace-write --skip-git-repo-check --color never",
    );
    expect(result.exitCode).toBe(0);
  });

  it("routes a claude request through the subprocess boundary", async () => {
    const adapter = new ClaudeStubAdapter();
    const result = await executeAdapterViaSubprocess(
      adapter,
      {
        mode: "run",
        prompt: "hello subprocess",
        verbose: false,
        model: "claude-sonnet-4-6",
      },
      {
        executionMode: "real",
        subprocessRunner: createStubSubprocessRunner(),
      },
    );

    expect(result.success).toBe(true);
    expect(result.rawOutput).toBe(
      "[stub:subprocess] claude -p --output-format text --permission-mode default --model claude-sonnet-4-6",
    );
    expect(result.exitCode).toBe(0);
  });

  it("includes a configured codex reasoning effort override in subprocess requests", async () => {
    updateCodexReasoningEffort("high");

    const adapter = new CodexStubAdapter();
    const result = await executeAdapterViaSubprocess(
      adapter,
      {
        mode: "run",
        prompt: "hello override",
        verbose: false,
        model: "gpt-5",
      },
      {
        executionMode: "real",
        subprocessRunner: createStubSubprocessRunner(),
      },
    );

    expect(result.success).toBe(true);
    expect(result.rawOutput).toBe(
      "[stub:subprocess] codex exec -c model_reasoning_effort=high --model gpt-5 - --sandbox workspace-write --skip-git-repo-check --color never",
    );
    expect(result.exitCode).toBe(0);
  });
});
