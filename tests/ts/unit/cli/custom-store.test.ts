import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadLastCustomModel, saveCustomModel } from "../../../../src/cli/model-setup/custom-store.js";

const tempDirs: string[] = [];

const createTempDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("custom model store", () => {
  it("uses DETOKS_HOME when saving and loading custom model metadata", () => {
    const home = createTempDir("detoks-custom-store-home-");
    const detoksHome = createTempDir("detoks-custom-store-detoks-home-");
    vi.stubEnv("HOME", home);
    vi.stubEnv("DETOKS_HOME", detoksHome);

    saveCustomModel({
      hfRepo: "owner/repo",
      hfFile: "model.gguf",
      quantization: "Q4_K_M",
      sizeMb: 42,
      savedAt: "ignored",
    });

    const storePath = join(detoksHome, "custom-models.json");
    expect(existsSync(storePath)).toBe(true);
    expect(existsSync(join(home, ".detoks", "custom-models.json"))).toBe(false);
    expect(JSON.parse(readFileSync(storePath, "utf8"))[0]).toMatchObject({
      hfRepo: "owner/repo",
      hfFile: "model.gguf",
      quantization: "Q4_K_M",
      sizeMb: 42,
    });
    expect(loadLastCustomModel()).toMatchObject({
      hfRepo: "owner/repo",
      hfFile: "model.gguf",
    });
  });
});
