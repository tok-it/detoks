import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  const tempDirs: string[] = [];
  const originalHome = process.env.HOME;

  beforeEach(() => {
    vi.clearAllMocks();
    const home = mkdtempSync(join(tmpdir(), "detoks-claude-cache-"));
    tempDirs.push(home);
    vi.stubEnv("HOME", home);
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }

    if (originalHome === undefined) {
      vi.unstubAllEnvs();
    } else {
      vi.stubEnv("HOME", originalHome);
    }
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

    const cachePath = join(process.env.HOME ?? "", ".detoks", "cache", "adapter-status", "claude.json");
    expect(existsSync(cachePath)).toBe(true);
    expect(JSON.parse(readFileSync(cachePath, "utf-8"))).toMatchObject({
      version: 1,
      value: {
        authenticated: true,
        authType: "oauth / claude.ai",
        apiProvider: "claude.ai",
      },
    });
  });

  it("treats malformed Claude auth output as logged out", () => {
    childProcessMocks.execSync.mockReturnValueOnce("{not-json");

    expect(getClaudeLoginStatus()).toEqual({
      authenticated: false,
      authType: undefined,
      apiProvider: undefined,
    });
  });

  it("returns the known Claude model list without shelling out", () => {
    expect(getClaudeAvailableModels()).toEqual([
      { slug: "claude-opus-4-7", display_name: "Claude Opus 4.7" },
      { slug: "claude-sonnet-4-6", display_name: "Claude Sonnet 4.6" },
      { slug: "claude-haiku-4-5", display_name: "Claude Haiku 4.5" },
    ]);
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
