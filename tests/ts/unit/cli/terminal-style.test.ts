import { describe, expect, it } from "vitest";
import {
  createTerminalStyle,
  formatTerminalHelp,
  formatTerminalTrace,
  shouldUseTerminalColor,
} from "../../../../src/cli/terminal-style.js";

describe("terminal style", () => {
  it("disables color outside TTYs", () => {
    expect(shouldUseTerminalColor({ isTTY: false, env: {} })).toBe(false);
  });

  it("disables color when NO_COLOR is set", () => {
    expect(shouldUseTerminalColor({ isTTY: true, env: { NO_COLOR: "1" } })).toBe(false);
  });

  it("disables color in CI by default", () => {
    expect(shouldUseTerminalColor({ isTTY: true, env: { CI: "1" } })).toBe(false);
  });

  it("allows FORCE_COLOR to override CI", () => {
    expect(shouldUseTerminalColor({ isTTY: true, env: { CI: "1", FORCE_COLOR: "1" } })).toBe(true);
  });

  it("wraps styled text with ANSI codes when enabled", () => {
    const style = createTerminalStyle({ isTTY: true, env: { FORCE_COLOR: "1" } });
    expect(style.prompt("detoks> ")).toBe("\x1b[1m\x1b[36mdetoks> \x1b[0m");
    expect(style.selected("❯ codex")).toBe("\x1b[1m\x1b[36m❯ codex\x1b[0m");
    expect(style.adapterBadge("codex", { model: "gpt-5", executionMode: "real" })).toBe(
      "\x1b[1m\x1b[36m◆ CODEX[gpt-5] · real\x1b[0m",
    );
    expect(style.adapterBadge("gemini", { model: "gemini-2.5-pro", executionMode: "real" })).toBe(
      "\x1b[1m\x1b[35m◆ GEMINI[gemini-2.5-pro] · real\x1b[0m",
    );
  });

  it("returns plain text when disabled", () => {
    const style = createTerminalStyle({ isTTY: false, env: {} });
    expect(style.success("✓ done")).toBe("✓ done");
    expect(style.muted("hint")).toBe("hint");
    expect(style.adapterBadge("codex", { model: "gpt-5", executionMode: "real" })).toBe(
      "◆ CODEX[gpt-5] · real",
    );
  });

  it("styles help titles, sections, and option names when enabled", () => {
    const formatted = formatTerminalHelp(
      ["DeToks CLI Guide", "", "Usage:", "  detoks repl", "  --verbose    Show details"].join("\n"),
      { isTTY: true, env: { FORCE_COLOR: "1" } },
    );

    expect(formatted).toContain("\x1b[1mDeToks CLI Guide\x1b[0m");
    expect(formatted).toContain("\x1b[1mUsage:\x1b[0m");
    expect(formatted).toContain("  \x1b[1mdetoks repl\x1b[0m");
    expect(formatted).toContain("  \x1b[1m--verbose\x1b[0m    Show details");
  });

  it("styles trace notes and markdown headings when enabled", () => {
    const formatted = formatTerminalTrace(
      [
        "# Pipeline Trace Report",
        "**Session ID**: session-123",
        "## Summary",
        "- **Total Duration**: 10ms",
        "### ✅ stage",
        "[Trace saved → trace.json]",
      ].join("\n"),
      { isTTY: true, env: { FORCE_COLOR: "1" } },
    );

    expect(formatted).toContain("\x1b[1mPipeline Trace Report\x1b[0m");
    expect(formatted).toContain("\x1b[1m**Session ID**:\x1b[0m session-123");
    expect(formatted).toContain("\x1b[1mSummary\x1b[0m");
    expect(formatted).toContain("- \x1b[1m**Total Duration**:\x1b[0m 10ms");
    expect(formatted).toContain("\x1b[1m✅ stage\x1b[0m");
    expect(formatted).toContain("\x1b[2m[Trace saved → trace.json]\x1b[0m");
  });
});
