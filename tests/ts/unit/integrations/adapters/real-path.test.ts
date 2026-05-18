import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CodexStubAdapter } from "../../../../../src/integrations/adapters/codex/adapter.js";
import { ClaudeStubAdapter } from "../../../../../src/integrations/adapters/claude/adapter.js";
import { GeminiStubAdapter } from "../../../../../src/integrations/adapters/gemini/adapter.js";
import { executeAdapterViaSubprocess } from "../../../../../src/integrations/adapters/real.js";
import type { ActionTimelineEvent } from "../../../../../src/core/timeline/types.js";
import type { SubprocessRequest, TranscriptAwareSubprocessRunner } from "../../../../../src/integrations/subprocess/types.js";

const capturedRequests: SubprocessRequest[] = [];

const fakeRunner: TranscriptAwareSubprocessRunner = {
  async run(request: SubprocessRequest) {
    capturedRequests.push(request);
    return {
      stdout: `[fake:${request.command}] ${request.input ?? ""}`,
      stderr: "",
      exitCode: request.command === "gemini" ? 3 : 0,
      timedOut: false,
    };
  },
  async runWithTranscript(request: SubprocessRequest) {
    capturedRequests.push(request);
    return {
      stdout: `[fake:${request.command}] ${request.input ?? ""}`,
      stderr: "",
      exitCode: request.command === "gemini" ? 3 : 0,
      timedOut: false,
      transcript: {
        events: [
          {
            type: "chunk",
            timestamp: 1,
            stream: "stdout",
            data: `[fake:${request.command}]`,
          },
          {
            type: "exit",
            timestamp: 2,
            data: String(request.command === "gemini" ? 3 : 0),
          },
        ],
        startTime: 1,
        endTime: 2,
        totalDuration: 1,
        exitCode: request.command === "gemini" ? 3 : 0,
        timedOut: false,
      },
    };
  },
};

const tempDirs: string[] = [];

beforeEach(() => {
  const home = mkdtempSync(join(tmpdir(), "detoks-real-path-"));
  tempDirs.push(home);
  vi.stubEnv("HOME", home);
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }

  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("adapter execution modes", () => {
  it("records codex real execution requests with the codex command", async () => {
    capturedRequests.length = 0;
    const adapter = new CodexStubAdapter();
    const timelineEvents: ActionTimelineEvent[] = [];

    const realResult = await adapter.execute(
      {
        mode: "run",
        prompt: "real prompt",
        verbose: false,
        model: "gpt-5",
        cwd: "/workspace",
      },
      {
        executionMode: "real",
        subprocessRunner: fakeRunner,
        onActionTimelineEvent: (event) => {
          timelineEvents.push(event);
        },
      },
    );

    expect(capturedRequests).toEqual([
      {
        command: "codex",
        args: [
          "exec",
          "-C",
          "/workspace",
          "--model",
          "gpt-5",
          "-",
          "--sandbox",
          "workspace-write",
          "--skip-git-repo-check",
          "--color",
          "never",
        ],
        cwd: "/workspace",
        env: {
          GIT_CEILING_DIRECTORIES: "/",
        },
        input: "real prompt",
      },
    ]);
    expect(realResult.rawOutput).toBe("[fake:codex] real prompt");
    expect(realResult.exitCode).toBe(0);
    expect(realResult.transcript?.events).toHaveLength(2);
    expect(timelineEvents.map((event) => event.kind)).toEqual([
      "tool_call",
      "tool_result",
    ]);
  });

  it("prefers codex output-last-message text over PTY progress output in embedded mode", async () => {
    capturedRequests.length = 0;
    const transcriptRunner: TranscriptAwareSubprocessRunner = {
      async run(request: SubprocessRequest) {
        capturedRequests.push(request);
        return {
          stdout: "progress only",
          stderr: "",
          exitCode: 0,
          timedOut: false,
        };
      },
      async runWithTranscript(request: SubprocessRequest) {
        capturedRequests.push(request);
        if (request.outputLastMessagePath) {
          writeFileSync(request.outputLastMessagePath, "final embedded answer\n", "utf8");
        }
        return {
          stdout: "progress only",
          stderr: "",
          exitCode: 0,
          timedOut: false,
          transcript: {
            events: [],
            startTime: 1,
            endTime: 2,
            totalDuration: 1,
            exitCode: 0,
            timedOut: false,
          },
        };
      },
    };
    const result = await executeAdapterViaSubprocess(
      new CodexStubAdapter(),
      {
        mode: "repl",
        prompt: "embedded prompt",
        verbose: false,
        cwd: "/workspace",
        presentationMode: "embedded-pane",
      },
      {
        executionMode: "real",
        subprocessRunner: transcriptRunner,
      },
    );

    expect(capturedRequests).toHaveLength(1);
    expect(capturedRequests[0]?.outputLastMessagePath).toMatch(/last-message\.txt$/);
    expect(result.rawOutput).toBe("final embedded answer");
  });

  it("records gemini real execution requests with the gemini command", async () => {
    capturedRequests.length = 0;
    const adapter = new GeminiStubAdapter();

    const realResult = await adapter.execute(
      {
        mode: "run",
        prompt: "real prompt",
        verbose: true,
        model: "gemini-2.5-pro",
        cwd: "/tmp",
      },
      {
        executionMode: "real",
        subprocessRunner: fakeRunner,
      },
    );

    expect(capturedRequests).toEqual([
      {
        command: "gemini",
        args: ["--model", "gemini-2.5-pro"],
        cwd: "/tmp",
        env: {
          GIT_CEILING_DIRECTORIES: "/",
        },
        input: "real prompt",
      },
    ]);
    expect(realResult.rawOutput).toBe("[fake:gemini] real prompt");
    expect(realResult.exitCode).toBe(3);
  });

  it("records claude real execution requests with the claude command", async () => {
    capturedRequests.length = 0;
    const adapter = new ClaudeStubAdapter();

    const realResult = await adapter.execute(
      {
        mode: "run",
        prompt: "real prompt",
        verbose: false,
        model: "claude-sonnet-4-6",
        cwd: "/workspace",
      },
      {
        executionMode: "real",
        subprocessRunner: fakeRunner,
      },
    );

    expect(capturedRequests).toEqual([
      {
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
        cwd: "/workspace",
        env: {
          GIT_CEILING_DIRECTORIES: "/",
        },
        input: "real prompt",
      },
    ]);
    expect(realResult.rawOutput).toBe("[fake:claude] real prompt");
    expect(realResult.exitCode).toBe(0);
  });

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

  it("keeps claude stub execution separate from real execution", async () => {
    const adapter = new ClaudeStubAdapter();

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

    expect(stubResult.rawOutput).toBe("[stub:claude] stub prompt");
    expect(stubResult.exitCode).toBe(0);
    expect(realResult.rawOutput).toBe("[fake:claude] real prompt");
    expect(realResult.exitCode).toBe(0);
  });
});
