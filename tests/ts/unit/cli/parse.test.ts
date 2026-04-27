import { describe, expect, it } from "vitest";
import { getCliUsage, parseCliArgs } from "../../../../src/cli/parse.js";

describe("parseCliArgs", () => {
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

  it("documents execution mode differences in main help", () => {
    const usage = getCliUsage("main");
    expect(usage).toContain("Examples:");
    expect(usage).toContain('detoks "summarize the current repo status"');
    expect(usage).toContain("detoks --file tests/data/row_data.json --verbose");
    expect(usage).toContain("--file <path>");
    expect(usage).toContain("detoks repl --adapter codex --execution-mode stub");
    expect(usage).toContain("detoks checkpoint list <session-id>");
    expect(usage).toContain("detoks checkpoint show <checkpoint-id>");
    expect(usage).toContain("detoks checkpoint list session_2026_04_27");
    expect(usage).toContain("detoks checkpoint show session_2026_04_27_checkpoint_001");
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

  it("documents checkpoint list as a read-only command", () => {
    const usage = getCliUsage("checkpoint-list");
    expect(usage).toContain("detoks checkpoint list <session-id>");
    expect(usage).toContain("read-only");
    expect(usage).toContain("does not restore or modify session state");
    expect(usage).toContain("hasCheckpoints");
    expect(usage).toContain("checkpoints=[]");
  });

  it("documents checkpoint show as a read-only command", () => {
    const usage = getCliUsage("checkpoint-show");
    expect(usage).toContain("detoks checkpoint show <checkpoint-id>");
    expect(usage).toContain("read-only");
    expect(usage).toContain("does not restore or modify session state");
    expect(usage).toContain("changedFiles");
    expect(usage).toContain("nextAction");
  });

  it("adds actionable guidance to parse errors", () => {
    expect(() => parseCliArgs(["--execution-mode"])).toThrow(
      /Run `detoks --help` for usage/,
    );
    expect(() => parseCliArgs(["--unknown"])).toThrow(/Run `detoks --help` for usage/);
    expect(() => parseCliArgs(["hello detoks", "--file", "input.json"])).toThrow(
      /Prompt input and --file cannot be used together/,
    );
    expect(() => parseCliArgs(["checkpoint", "list"])).toThrow(
      /requires exactly one <session-id>/,
    );
    expect(() => parseCliArgs(["checkpoint", "show"])).toThrow(
      /requires exactly one <checkpoint-id>/,
    );
  });
});
