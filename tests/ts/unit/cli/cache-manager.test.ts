import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDetoksCacheDir, invalidateCache, writeCache } from "../../../../src/cli/cache/cache-manager.js";

describe("cache manager", () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    const home = mkdtempSync(join(tmpdir(), "detoks-cache-manager-"));
    tempDirs.push(home);
    vi.stubEnv("HOME", home);
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
    vi.unstubAllEnvs();
  });

  it("does nothing when the cache file is missing", () => {
    expect(() => invalidateCache("adapter-status", "missing")).not.toThrow();
  });

  it("removes an existing cache file", () => {
    const cacheDir = join(getDetoksCacheDir(), "adapter-status");
    mkdirSync(cacheDir, { recursive: true });
    const cachePath = join(cacheDir, "claude.json");
    writeFileSync(cachePath, "{}", "utf-8");

    invalidateCache("adapter-status", "claude");

    expect(existsSync(cachePath)).toBe(false);
  });

  it("swallows unlink failures so invalidation stays best-effort", () => {
    const cachePath = join(getDetoksCacheDir(), "adapter-status", "claude.json");
    mkdirSync(cachePath, { recursive: true });

    expect(() => invalidateCache("adapter-status", "claude")).not.toThrow();
    expect(existsSync(cachePath)).toBe(true);
  });

  it("uses DETOKS_HOME for cache files when set", () => {
    const home = mkdtempSync(join(tmpdir(), "detoks-cache-home-"));
    const detoksHome = mkdtempSync(join(tmpdir(), "detoks-cache-detoks-home-"));
    tempDirs.push(home, detoksHome);
    vi.stubEnv("HOME", home);
    vi.stubEnv("DETOKS_HOME", detoksHome);

    expect(getDetoksCacheDir()).toBe(join(detoksHome, "cache"));
  });

  it("keeps cache writes best-effort when DETOKS_HOME is not writable", () => {
    const home = mkdtempSync(join(tmpdir(), "detoks-cache-unwritable-home-"));
    const detoksHomeFile = join(home, "detoks-home-file");
    writeFileSync(detoksHomeFile, "not a directory", "utf-8");
    tempDirs.push(home);
    vi.stubEnv("HOME", home);
    vi.stubEnv("DETOKS_HOME", detoksHomeFile);

    expect(() => writeCache("adapter-status", "gemini", { authenticated: false }, 10_000)).not.toThrow();
  });
});
