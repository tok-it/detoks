import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDetoksCacheDir, invalidateCache } from "../../../../src/cli/cache/cache-manager.js";

describe("cache manager", () => {
  const tempDirs: string[] = [];
  const originalHome = process.env.HOME;

  beforeEach(() => {
    const home = mkdtempSync(join(tmpdir(), "detoks-cache-manager-"));
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
});
