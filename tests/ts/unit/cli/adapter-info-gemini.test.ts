import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  geminiLogout,
  getGeminiConfig,
  getGeminiLoginStatus,
} from "../../../../src/cli/adapter-info/gemini.js";

describe("gemini adapter info", () => {
  const tempDirs: string[] = [];
  const originalHome = process.env.HOME;

  beforeEach(() => {
    const home = mkdtempSync(join(tmpdir(), "detoks-gemini-cache-"));
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

  it("caches Gemini config and auth snapshots under ~/.detoks/cache", () => {
    const home = process.env.HOME ?? "";
    const geminiDir = join(home, ".gemini");
    mkdirSync(geminiDir, { recursive: true });

    const settingsPath = join(geminiDir, "settings.json");
    const firstConfig = {
      model: { name: "gemini-3.0-pro" },
      security: { auth: { selectedType: "oauth" } },
    };
    writeFileSync(settingsPath, JSON.stringify(firstConfig), "utf-8");

    expect(getGeminiConfig()).toEqual({
      currentModel: "gemini-3.0-pro",
      authType: "oauth",
    });
    expect(getGeminiLoginStatus()).toEqual({
      authenticated: true,
      authType: "oauth",
    });

    const configCachePath = join(home, ".detoks", "cache", "adapter-config", "gemini.json");
    const statusCachePath = join(home, ".detoks", "cache", "adapter-status", "gemini.json");
    expect(existsSync(configCachePath)).toBe(true);
    expect(existsSync(statusCachePath)).toBe(true);

    const cachedConfig = JSON.parse(readFileSync(configCachePath, "utf-8"));
    const cachedStatus = JSON.parse(readFileSync(statusCachePath, "utf-8"));
    expect(cachedConfig).toMatchObject({
      version: 1,
      value: {
        currentModel: "gemini-3.0-pro",
        authType: "oauth",
      },
    });
    expect(cachedStatus).toMatchObject({
      version: 1,
      value: {
        authenticated: true,
        authType: "oauth",
      },
    });

    const updatedConfig = {
      model: { name: "gemini-2.0-flash" },
      security: { auth: { selectedType: "service_account" } },
    };
    writeFileSync(settingsPath, JSON.stringify(updatedConfig), "utf-8");

    // cache hit should still return the first snapshot
    expect(getGeminiConfig()).toEqual({
      currentModel: "gemini-3.0-pro",
      authType: "oauth",
    });
    expect(getGeminiLoginStatus()).toEqual({
      authenticated: true,
      authType: "oauth",
    });

    expect(geminiLogout()).toBe(true);

    // invalidation should force a fresh read from the updated settings file
    expect(getGeminiConfig()).toEqual({
      currentModel: "gemini-2.0-flash",
      authType: "service_account",
    });
    expect(getGeminiLoginStatus()).toEqual({
      authenticated: true,
      authType: "service_account",
    });
  });
});
