import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRANSLATION_MODELS } from "../../../../src/cli/model-setup/models.js";

const mocks = vi.hoisted(() => ({
  selectModel: vi.fn(),
  downloadModel: vi.fn(),
}));

vi.mock("../../../../src/cli/model-setup/select.js", () => ({
  selectModel: mocks.selectModel,
}));

vi.mock("../../../../src/cli/model-setup/download.js", () => ({
  downloadModel: mocks.downloadModel,
}));

import { runModelSetupIfNeeded } from "../../../../src/cli/model-setup/index.js";

const tempDirs: string[] = [];

const setTTY = (stdin: boolean, stdout: boolean): void => {
  Object.defineProperty(process.stdin, "isTTY", {
    value: stdin,
    configurable: true,
  });
  Object.defineProperty(process.stdout, "isTTY", {
    value: stdout,
    configurable: true,
  });
};

const cleanupTTY = (): void => {
  delete (process.stdin as NodeJS.ReadStream & { isTTY?: boolean }).isTTY;
  delete (process.stdout as NodeJS.WriteStream & { isTTY?: boolean }).isTTY;
};

function createWorkspace(): { root: string; cwd: string; home: string } {
  const root = mkdtempSync(join(tmpdir(), "detoks-model-setup-"));
  tempDirs.push(root);

  const cwd = join(root, "project");
  const home = join(root, "home");
  mkdirSync(cwd, { recursive: true });

  return { root, cwd, home };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanupTTY();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();

  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("runModelSetupIfNeeded", () => {
  it("does not write user settings or model files when startup is non-TTY", async () => {
    const { cwd, home } = createWorkspace();
    vi.stubEnv("HOME", home);
    setTTY(false, false);

    await runModelSetupIfNeeded(cwd);

    expect(existsSync(join(home, ".detoks", "settings.json"))).toBe(false);
    expect(existsSync(join(cwd, ".env"))).toBe(false);
    expect(existsSync(join(cwd, ".env.local"))).toBe(false);
    expect(mocks.selectModel).not.toHaveBeenCalled();
    expect(mocks.downloadModel).not.toHaveBeenCalled();
  });

  it("persists the first interactive model selection to ~/.detoks/settings.json and .env", async () => {
    const { cwd, home } = createWorkspace();
    vi.stubEnv("HOME", home);
    setTTY(true, true);
    const stdoutWriteSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const selectedModel = TRANSLATION_MODELS[0]!;
    mocks.selectModel.mockResolvedValue(selectedModel);
    mocks.downloadModel.mockResolvedValue(undefined);

    try {
      await runModelSetupIfNeeded(cwd);

      const configPath = join(home, ".detoks", "settings.json");
      const envPath = join(cwd, ".env");
      const modelDir = join(home, ".detoks", "models");
      const modelPath = join(modelDir, selectedModel.hfFile);

      expect(mocks.selectModel).toHaveBeenCalledTimes(1);
      expect(mocks.downloadModel).toHaveBeenCalledTimes(1);
      expect(existsSync(configPath)).toBe(true);
      expect(existsSync(envPath)).toBe(true);
      expect(readFileSync(envPath, "utf8")).toContain(`LOCAL_LLM_MODEL_NAME=${selectedModel.modelName}`);
      expect(readFileSync(envPath, "utf8")).toContain(`LOCAL_LLM_MODEL_DIR=${modelDir}`);
      expect(readFileSync(envPath, "utf8")).toContain(`LOCAL_LLM_MODEL_PATH=${modelPath}`);

      expect(JSON.parse(readFileSync(configPath, "utf8"))).toMatchObject({
        translation: {
          model: selectedModel.modelName,
        },
      });
    } finally {
      stdoutWriteSpy.mockRestore();
    }
  });
});
