import { describe, expect, it } from "vitest";
import { isSlashCommand, getSlashCommand } from "../../../../../src/cli/repl-commands/index.js";

// Test whitelist behavior used by the TUI to decide whether a "/..." input
// should be treated as a slash command or fall through to prompt execution.
//
// The TUI calls isSlashCommand(input, adapter) and only routes to the slash
// command handler when it returns true. Inputs like "/tmp/path 에 파일..."
// must fall through to the LLM rather than being intercepted.

describe("isSlashCommand (whitelist gate)", () => {
  describe("known commands", () => {
    it.each([
      "/help",
      "/h",
      "/?",
      "/clear",
      "/c",
      "/model",
      "/m",
      "/adapter",
      "/a",
      "/mode",
      "/verbose",
      "/v",
      "/cache",
      "/ca",
      "/layout",
      "/l",
      "/nerd",
      "/nf",
      "/exit",
      "/quit",
      "/q",
    ])("recognizes %s", (input) => {
      expect(isSlashCommand(input, "codex")).toBe(true);
    });

    it("recognizes commands with arguments", () => {
      expect(isSlashCommand("/layout reset", "codex")).toBe(true);
      expect(isSlashCommand("/cache stats", "codex")).toBe(true);
      expect(isSlashCommand("/nerd on", "codex")).toBe(true);
    });

    it("is case-insensitive on the command name", () => {
      expect(isSlashCommand("/HELP", "codex")).toBe(true);
      expect(isSlashCommand("/Clear", "codex")).toBe(true);
    });
  });

  describe("natural-language paths starting with /", () => {
    it.each([
      "/tmp 디렉토리에 파일을 만들어줘",
      "/tmp/test.txt 를 읽어줘",
      "/etc/hosts 내용을 확인해줘",
      "/var/log 폴더를 확인해줘",
      "/usr/local/bin 에 무엇이 있는지 보여줘",
      "/path/to/something",
    ])("does NOT match natural-language path: %s", (input) => {
      expect(isSlashCommand(input, "codex")).toBe(false);
    });
  });

  describe("non-slash input", () => {
    it("returns false for plain prompt", () => {
      expect(isSlashCommand("hello world", "codex")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isSlashCommand("", "codex")).toBe(false);
    });

    it("returns false for input not starting with /", () => {
      expect(isSlashCommand("help", "codex")).toBe(false);
      expect(isSlashCommand("clear me up", "codex")).toBe(false);
    });
  });

  describe("unknown slash commands", () => {
    it("returns false for unknown command names", () => {
      expect(isSlashCommand("/unknown", "codex")).toBe(false);
      expect(isSlashCommand("/xyz123", "codex")).toBe(false);
      expect(isSlashCommand("/모름", "codex")).toBe(false);
    });
  });

  describe("getSlashCommand resolution", () => {
    it("resolves aliases to the canonical command", () => {
      expect(getSlashCommand("/h", "codex")?.name).toBe("help");
      expect(getSlashCommand("/v", "codex")?.name).toBe("verbose");
      expect(getSlashCommand("/q", "codex")?.name).toBe("exit");
    });

    it("returns null for unknown commands", () => {
      expect(getSlashCommand("/tmp", "codex")).toBeNull();
      expect(getSlashCommand("/etc", "codex")).toBeNull();
    });
  });
});
