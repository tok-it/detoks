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

  it("documents execution mode differences in main help", () => {
    const usage = getCliUsage("main");
    expect(usage).toContain("Examples:");
    expect(usage).toContain('detoks "summarize the current repo status"');
    expect(usage).toContain("detoks --file tests/data/row_data.json --verbose");
    expect(usage).toContain("--file <path>");
    expect(usage).toContain("detoks repl --adapter codex --execution-mode stub");
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

  it("adds actionable guidance to parse errors", () => {
    expect(() => parseCliArgs(["--execution-mode"])).toThrow(
      /Run `detoks --help` for usage/,
    );
    expect(() => parseCliArgs(["--unknown"])).toThrow(/Run `detoks --help` for usage/);
    expect(() => parseCliArgs(["hello detoks", "--file", "input.json"])).toThrow(
      /Prompt input and --file cannot be used together/,
    );
  });
});
