import { describe, expect, it } from "vitest";
import {
  formatAdapterCliReference,
  getAdapterLoginCommandSpec,
  getLoginHint,
  getLogoutHint,
} from "../../../../../src/cli/repl-commands/adapter-cli-reference.js";

describe("adapter CLI reference helpers", () => {
  it("maps adapters to login and logout hints", () => {
    expect(getAdapterLoginCommandSpec("codex")).toEqual({
      command: "codex",
      args: ["login"],
    });
    expect(getAdapterLoginCommandSpec("gemini")).toEqual({
      command: "gemini",
      args: [],
    });
    expect(getAdapterLoginCommandSpec("claude")).toEqual({
      command: "claude",
      args: ["auth", "login"],
    });

    expect(getLoginHint("codex")).toBe("codex login");
    expect(getLoginHint("gemini")).toBe("gemini");
    expect(getLoginHint("claude")).toBe("claude auth login");

    expect(getLogoutHint("codex")).toBe("codex logout");
    expect(getLogoutHint("gemini")).toBe("gemini logout");
    expect(getLogoutHint("claude")).toBe("claude auth logout");
  });

  it("formats the external adapter CLI reference", () => {
    const reference = formatAdapterCliReference();

    expect(reference).toContain("외부 adapter CLI 참고");
    expect(reference).toContain("Codex CLI");
    expect(reference).toContain("codex debug models");
    expect(reference).toContain("Gemini CLI");
    expect(reference).toContain("gemini");
    expect(reference).toContain("Claude Code");
    expect(reference).toContain("claude auth status --json");
    expect(reference).toContain("detoks 명령은 REPL 안에서");
  });
});
