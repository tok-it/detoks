import { describe, expect, it } from "vitest";
import {
  createTerminalStyle,
  formatTerminalHelp,
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
  });

  it("returns plain text when disabled", () => {
    const style = createTerminalStyle({ isTTY: false, env: {} });
    expect(style.success("✓ done")).toBe("✓ done");
    expect(style.muted("hint")).toBe("hint");
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
});
