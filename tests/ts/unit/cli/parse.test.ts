import { describe, expect, it } from "vitest";
import { getCliUsage, parseCliArgs } from "../../../../src/cli/parse.js";

describe("parseCliArgs", () => {
  it("treats an empty invocation as a main help request", () => {
    const parsed = parseCliArgs([]);
    expect(parsed).toEqual({
      mode: "run",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      trace: false,
      showHelp: true,
      helpTopic: "main",
    });
  });

  it("parses one-shot mode with defaults", () => {
    const parsed = parseCliArgs(["hello detoks"]);
    expect(parsed).toEqual({
      mode: "run",
      prompt: "hello detoks",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      trace: false,
      showHelp: false,
      helpTopic: "main",
    });
  });

  it("parses repl mode with flags", () => {
    const parsed = parseCliArgs([
      "repl",
      "--adapter",
      "gemini",
      "--execution-mode",
      "real",
      "--verbose",
    ]);
    expect(parsed).toEqual({
      mode: "repl",
      adapter: "gemini",
      executionMode: "real",
      verbose: true,
      trace: false,
      showHelp: false,
      helpTopic: "repl",
    });
  });

  it("parses batch file mode", () => {
    const parsed = parseCliArgs(["--file", "tests/data/row_data.json", "--verbose"]);
    expect(parsed).toEqual({
      mode: "run",
      inputFile: "tests/data/row_data.json",
      adapter: "codex",
      executionMode: "stub",
      verbose: true,
      trace: false,
      showHelp: false,
      helpTopic: "main",
    });
  });

  it("parses session list as the read-only session entrypoint", () => {
    const parsed = parseCliArgs(["session", "list"]);
    expect(parsed).toEqual({
      mode: "run",
      command: "session-list",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      trace: false,
      showHelp: false,
      helpTopic: "session-list",
    });
  });

  it("parses checkpoint list as a read-only session command", () => {
    const parsed = parseCliArgs(["checkpoint", "list", "session_2026_04_27"]);
    expect(parsed).toEqual({
      mode: "run",
      command: "checkpoint-list",
      sessionId: "session_2026_04_27",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      trace: false,
      showHelp: false,
      helpTopic: "checkpoint-list",
    });
  });

  it("parses session continue as a session resume entrypoint", () => {
    const parsed = parseCliArgs(["session", "continue", "session_2026_04_27"]);
    expect(parsed).toEqual({
      mode: "run",
      command: "session-continue",
      sessionId: "session_2026_04_27",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      trace: false,
      showHelp: false,
      helpTopic: "session-continue",
    });
  });

  it("parses session fork as a session mutation entrypoint", () => {
    const parsed = parseCliArgs(["session", "fork", "session_2026_04_27", "session_2026_04_27_fork"]);
    expect(parsed).toEqual({
      mode: "run",
      command: "session-fork",
      sessionId: "session_2026_04_27",
      newSessionId: "session_2026_04_27_fork",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      trace: false,
      showHelp: false,
      helpTopic: "session-fork",
    });
  });

  it("parses session reset as a destructive session mutation entrypoint", () => {
    const parsed = parseCliArgs(["session", "reset", "session_2026_04_27"]);
    expect(parsed).toEqual({
      mode: "run",
      command: "session-reset",
      sessionId: "session_2026_04_27",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      trace: false,
      showHelp: false,
      helpTopic: "session-reset",
    });
  });

  it("parses checkpoint show as the next read-only checkpoint command", () => {
    const parsed = parseCliArgs(["checkpoint", "show", "session_2026_04_27_checkpoint_001"]);
    expect(parsed).toEqual({
      mode: "run",
      command: "checkpoint-show",
      checkpointId: "session_2026_04_27_checkpoint_001",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      trace: false,
      showHelp: false,
      helpTopic: "checkpoint-show",
    });
  });

  it("parses checkpoint restore as a checkpoint mutation entrypoint", () => {
    const parsed = parseCliArgs(["checkpoint", "restore", "session_2026_04_27_checkpoint_001"]);
    expect(parsed).toEqual({
      mode: "run",
      command: "checkpoint-restore",
      checkpointId: "session_2026_04_27_checkpoint_001",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      trace: false,
      showHelp: false,
      helpTopic: "checkpoint-restore",
    });
  });

  it("parses help flags without treating them as errors", () => {
    const parsed = parseCliArgs(["--help"]);
    expect(parsed).toMatchObject({
      mode: "run",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      showHelp: true,
      helpTopic: "main",
    });
  });

  it("accepts -h as a help alias", () => {
    const parsed = parseCliArgs(["-h"]);
    expect(parsed).toMatchObject({
      showHelp: true,
      helpTopic: "main",
    });
  });

  it("treats help as higher priority than normal parsing", () => {
    const parsed = parseCliArgs(["hello detoks", "--help"]);
    expect(parsed).toMatchObject({
      showHelp: true,
      adapter: "codex",
      executionMode: "stub",
      helpTopic: "main",
    });
  });

  it("parses repl help as a topic-specific help request", () => {
    const parsed = parseCliArgs(["repl", "--help"]);
    expect(parsed).toMatchObject({
      mode: "run",
      showHelp: true,
      helpTopic: "repl",
    });
  });

  it("parses session list help as a topic-specific help request", () => {
    const parsed = parseCliArgs(["session", "list", "--help"]);
    expect(parsed).toMatchObject({
      mode: "run",
      showHelp: true,
      helpTopic: "session-list",
    });
  });

  it("parses session continue help as a topic-specific help request", () => {
    const parsed = parseCliArgs(["session", "continue", "--help"]);
    expect(parsed).toMatchObject({
      mode: "run",
      showHelp: true,
      helpTopic: "session-continue",
    });
  });

  it("parses session fork help as a topic-specific help request", () => {
    const parsed = parseCliArgs(["session", "fork", "--help"]);
    expect(parsed).toMatchObject({
      mode: "run",
      showHelp: true,
      helpTopic: "session-fork",
    });
  });

  it("parses session reset help as a topic-specific help request", () => {
    const parsed = parseCliArgs(["session", "reset", "--help"]);
    expect(parsed).toMatchObject({
      mode: "run",
      showHelp: true,
      helpTopic: "session-reset",
    });
  });

  it("parses checkpoint list help as a topic-specific help request", () => {
    const parsed = parseCliArgs(["checkpoint", "list", "--help"]);
    expect(parsed).toMatchObject({
      mode: "run",
      showHelp: true,
      helpTopic: "checkpoint-list",
    });
  });

  it("parses checkpoint show help as a topic-specific help request", () => {
    const parsed = parseCliArgs(["checkpoint", "show", "--help"]);
    expect(parsed).toMatchObject({
      mode: "run",
      showHelp: true,
      helpTopic: "checkpoint-show",
    });
  });

  it("parses checkpoint restore help as a topic-specific help request", () => {
    const parsed = parseCliArgs(["checkpoint", "restore", "--help"]);
    expect(parsed).toMatchObject({
      mode: "run",
      showHelp: true,
      helpTopic: "checkpoint-restore",
    });
  });

  it("documents execution mode differences in main help", () => {
    const usage = getCliUsage("main");
    expect(usage).toContain("DeToks CLI Guide");
    expect(usage).toContain("Quick start:");
    expect(usage).toContain("Examples:");
    expect(usage).toContain('detoks "summarize the current repo status"');
    expect(usage).toContain("detoks --file tests/data/row_data.json --verbose");
    expect(usage).toContain("--file <path>");
    expect(usage).toContain("detoks repl --adapter codex --execution-mode stub");
    expect(usage).toContain("Session / checkpoint commands:");
    expect(usage).toContain("detoks session list");
    expect(usage).toContain("detoks session continue <session-id>");
    expect(usage).toContain("detoks session continue session_2026_04_27");
    expect(usage).toContain("detoks session reset <session-id>");
    expect(usage).toContain("detoks session reset session_2026_04_27");
    expect(usage).toContain("detoks session fork <source-session-id> <new-session-id>");
    expect(usage).toContain("detoks session fork session_2026_04_27 session_2026_04_27_fork");
    expect(usage).toContain("detoks checkpoint list <session-id>");
    expect(usage).toContain("detoks checkpoint show <checkpoint-id>");
    expect(usage).toContain("detoks checkpoint list session_2026_04_27");
    expect(usage).toContain("detoks checkpoint show session_2026_04_27_checkpoint_001");
    expect(usage).toContain("detoks checkpoint restore <checkpoint-id>");
    expect(usage).toContain("detoks checkpoint restore session_2026_04_27_checkpoint_001");
    expect(usage).toContain("Local LLM env (read from current cwd .env / .env.local):");
    expect(usage).toContain("LOCAL_LLM_API_BASE, LOCAL_LLM_API_KEY, LOCAL_LLM_MODEL_NAME");
    expect(usage).toContain("--session <id>");
    expect(usage).toContain("Execution mode:");
    expect(usage).toContain("stub = simulated output for fast, safe CLI testing");
    expect(usage).toContain("real = runs the adapter's real execution path");
    expect(usage).toContain("Show full success JSON and error stacks");
  });

  it("documents execution mode differences in repl help", () => {
    const usage = getCliUsage("repl");
    expect(usage).toContain("Example:");
    expect(usage).toContain("detoks repl --adapter codex --execution-mode stub");
    expect(usage).toContain("execution-mode controls whether prompts use simulated or real execution");
    expect(usage).toContain("stub = simulated output for fast, safe CLI testing");
    expect(usage).toContain("real = runs the adapter's real execution path");
    expect(usage).toContain("Show full success JSON and error stacks");
  });

  it("documents session list as a read-only command with a minimal stdout contract", () => {
    const usage = getCliUsage("session-list");
    expect(usage).toContain("detoks session list");
    expect(usage).toContain("read-only");
    expect(usage).toContain("does not create, continue, reset, fork, or modify session state");
    expect(usage).toContain("mutatesState=false");
    expect(usage).toContain("hasSessions");
    expect(usage).toContain("sessionCount");
    expect(usage).toContain("completedTaskCount");
  });

  it("documents session continue as a session resume command", () => {
    const usage = getCliUsage("session-continue");
    expect(usage).toContain("detoks session continue <session-id>");
    expect(usage).toContain("by replaying its stored raw_input");
    expect(usage).toContain("skips already completed task ids");
    expect(usage).toContain("if the session is missing or has no stored raw_input");
    expect(usage).toContain("message");
    expect(usage).toContain("resumeStarted");
    expect(usage).toContain("taskRecords");
  });

  it("documents session fork as a minimal mutation command", () => {
    const usage = getCliUsage("session-fork");
    expect(usage).toContain("detoks session fork <source-session-id> <new-session-id>");
    expect(usage).toContain("copies an existing saved session to a new session id");
    expect(usage).toContain("prevents overwriting an existing new session id");
    expect(usage).toContain("does not start resume execution or mutate task results");
    expect(usage).toContain("exit code 1");
    expect(usage).toContain("sourceSessionId");
    expect(usage).toContain("newSessionId");
  });

  it("documents session reset as a destructive session mutation command", () => {
    const usage = getCliUsage("session-reset");
    expect(usage).toContain("detoks session reset <session-id>");
    expect(usage).toContain("deletes the session state and all its task results");
    expect(usage).toContain("dangerous; cannot be undone");
    expect(usage).toContain("mutatesState");
    expect(usage).toContain("exit code 1");
    expect(usage).toContain("reset=true");
  });

  it("documents checkpoint list as a read-only command", () => {
    const usage = getCliUsage("checkpoint-list");
    expect(usage).toContain("detoks checkpoint list <session-id>");
    expect(usage).toContain("read-only");
    expect(usage).toContain("does not restore or modify session state");
    expect(usage).toContain("mutatesState=false");
    expect(usage).toContain("hasCheckpoints");
    expect(usage).toContain("checkpoints=[]");
  });

  it("documents checkpoint show as a read-only command", () => {
    const usage = getCliUsage("checkpoint-show");
    expect(usage).toContain("detoks checkpoint show <checkpoint-id>");
    expect(usage).toContain("read-only");
    expect(usage).toContain("does not restore or modify session state");
    expect(usage).toContain("mutatesState=false");
    expect(usage).toContain("message");
    expect(usage).toContain("changedFiles");
    expect(usage).toContain("nextAction");
  });

  it("documents checkpoint restore as a checkpoint mutation command", () => {
    const usage = getCliUsage("checkpoint-restore");
    expect(usage).toContain("detoks checkpoint restore <checkpoint-id>");
    expect(usage).toContain("restores a session to the state captured at this checkpoint");
    expect(usage).toContain("subsequent task results after this checkpoint will be truncated");
    expect(usage).toContain("mutatesState");
    expect(usage).toContain("exit code 1");
    expect(usage).toContain("restored=true");
  });

  it("adds actionable guidance to parse errors", () => {
    expect(() => parseCliArgs(["--execution-mode"])).toThrow(
      /Run `detoks --help` for usage/,
    );
    expect(() => parseCliArgs(["--unknown"])).toThrow(/Run `detoks --help` for usage/);
    expect(() => parseCliArgs(["hello detoks", "--file", "input.json"])).toThrow(
      /Prompt input and --file cannot be used together/,
    );
    expect(() => parseCliArgs(["session", "list", "extra"])).toThrow(
      /does not accept arguments/,
    );
    expect(() => parseCliArgs(["session", "continue"])).toThrow(
      /requires exactly one <session-id>/,
    );
    expect(() => parseCliArgs(["session", "reset"])).toThrow(
      /requires exactly one <session-id>/,
    );
    expect(() => parseCliArgs(["session", "fork", "source_only"])).toThrow(
      /requires exactly one <source-session-id> and one <new-session-id>/,
    );
    expect(() => parseCliArgs(["checkpoint", "list"])).toThrow(
      /requires exactly one <session-id>/,
    );
    expect(() => parseCliArgs(["checkpoint", "show"])).toThrow(
      /requires exactly one <checkpoint-id>/,
    );
    expect(() => parseCliArgs(["checkpoint", "restore"])).toThrow(
      /requires exactly one <checkpoint-id>/,
    );
  });
});
