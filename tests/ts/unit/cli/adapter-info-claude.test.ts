import { beforeEach, describe, expect, it, vi } from "vitest";

const childProcessMocks = vi.hoisted(() => {
  const execSync = vi.fn();

  return { execSync };
});

vi.mock("node:child_process", () => ({
  execSync: childProcessMocks.execSync,
}));

import {
  claudeLogout,
  getClaudeAvailableModels,
  getClaudeLoginStatus,
} from "../../../../src/cli/adapter-info/claude.js";

describe("claude adapter info", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses authenticated Claude auth JSON", () => {
    childProcessMocks.execSync.mockReturnValueOnce(
      JSON.stringify({
        loggedIn: true,
        authMethod: "oauth",
        apiProvider: "claude.ai",
      }),
    );

    expect(getClaudeLoginStatus()).toEqual({
      authenticated: true,
      authType: "oauth / claude.ai",
      apiProvider: "claude.ai",
    });
    expect(childProcessMocks.execSync).toHaveBeenCalledWith(
      "claude auth status --json 2>&1",
      { encoding: "utf-8" },
    );
  });

  it("treats malformed Claude auth output as logged out", () => {
    childProcessMocks.execSync.mockReturnValueOnce("{not-json");

    expect(getClaudeLoginStatus()).toEqual({
      authenticated: false,
      authType: undefined,
      apiProvider: undefined,
    });
  });

  it("returns an empty model list without shelling out", () => {
    expect(getClaudeAvailableModels()).toEqual([]);
    expect(childProcessMocks.execSync).not.toHaveBeenCalled();
  });

  it("returns true when Claude logout succeeds", () => {
    childProcessMocks.execSync.mockReturnValueOnce("");

    expect(claudeLogout()).toBe(true);
    expect(childProcessMocks.execSync).toHaveBeenCalledWith(
      "claude auth logout 2>&1",
      { encoding: "utf-8" },
    );
  });

  it("returns false when Claude logout fails", () => {
    childProcessMocks.execSync.mockImplementationOnce(() => {
      throw new Error("boom");
    });

    expect(claudeLogout()).toBe(false);
  });
});
