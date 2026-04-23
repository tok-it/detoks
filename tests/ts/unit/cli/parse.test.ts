import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../../../../src/cli/parse.js";

describe("parseCliArgs", () => {
  it("parses one-shot mode with defaults", () => {
    const parsed = parseCliArgs(["hello detoks"]);
    expect(parsed).toEqual({
      mode: "run",
      prompt: "hello detoks",
      adapter: "codex",
      verbose: false,
    });
  });

  it("parses repl mode with flags", () => {
    const parsed = parseCliArgs(["repl", "--adapter", "gemini", "--verbose"]);
    expect(parsed).toEqual({
      mode: "repl",
      adapter: "gemini",
      verbose: true,
    });
  });
});
