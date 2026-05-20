import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KURE_EMBEDDING_MODEL, TRANSLATION_MODELS } from "../../../../src/cli/model-setup/models.js";
import {
  getDetoksModelDir,
  getDetoksModelFilePath,
} from "../../../../src/core/model-store.js";

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

import { ensureEmbeddingModelReady, runModelSetupIfNeeded } from "../../../../src/cli/model-setup/index.js";

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
  // @ts-ignore - delete operator works at runtime even if TypeScript complains
  delete (process.stdin as NodeJS.ReadStream & { isTTY?: boolean }).isTTY;
  // @ts-ignore - delete operator works at runtime even if TypeScript complains
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
  delete process.env.LOCAL_LLM_MODEL_NAME;
  delete process.env.LOCAL_LLM_RUNTIME_PROVIDER;
  delete process.env.MODEL_NAME;
  delete process.env.LOCAL_LLM_MODEL_DIR;
  delete process.env.LOCAL_LLM_MODEL_PATH;
  delete process.env.LOCAL_LLM_HF_REPO;
  delete process.env.LOCAL_LLM_HF_FILE;
  delete process.env.RAG_EMBEDDING_MODEL_PATH;
});

afterEach(() => {
  cleanupTTY();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete process.env.LOCAL_LLM_MODEL_NAME;
  delete process.env.LOCAL_LLM_RUNTIME_PROVIDER;
  delete process.env.MODEL_NAME;
  delete process.env.LOCAL_LLM_MODEL_DIR;
  delete process.env.LOCAL_LLM_MODEL_PATH;
  delete process.env.LOCAL_LLM_HF_REPO;
  delete process.env.LOCAL_LLM_HF_FILE;
  delete process.env.RAG_EMBEDDING_MODEL_PATH;

  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("ensureEmbeddingModelReady", () => {
  it("does not download a missing embedding model during non-TTY startup", async () => {
    const { cwd, home } = createWorkspace();
    vi.stubEnv("HOME", home);
    vi.stubEnv("DETOKS_HOME", join(home, "detoks-home"));
    setTTY(false, false);

    await ensureEmbeddingModelReady(cwd);

    expect(mocks.downloadModel).not.toHaveBeenCalled();
    expect(existsSync(join(cwd, ".env"))).toBe(false);
    expect(process.env.RAG_EMBEDDING_MODEL_PATH).toBeUndefined();
  });

  it("sets RAG_EMBEDDING_MODEL_PATH when the embedding model already exists", async () => {
    const { cwd, home } = createWorkspace();
    vi.stubEnv("HOME", home);
    setTTY(false, false);
    const embeddingModelPath = getDetoksModelFilePath(KURE_EMBEDDING_MODEL);
    mkdirSync(join(embeddingModelPath, ".."), { recursive: true });
    writeFileSync(embeddingModelPath, "GGUFembedding", "utf8");

    await ensureEmbeddingModelReady(cwd);

    expect(mocks.downloadModel).not.toHaveBeenCalled();
    expect(process.env.RAG_EMBEDDING_MODEL_PATH).toBe(embeddingModelPath);
    expect(readFileSync(join(cwd, ".env"), "utf8")).toContain(
      `RAG_EMBEDDING_MODEL_PATH=${embeddingModelPath}`,
    );
  });
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
      const modelDir = getDetoksModelDir(selectedModel);
      const modelPath = getDetoksModelFilePath(selectedModel);

      expect(mocks.selectModel).toHaveBeenCalledTimes(1);
      expect(mocks.downloadModel).toHaveBeenCalledWith(selectedModel);
      expect(existsSync(configPath)).toBe(true);
      expect(existsSync(envPath)).toBe(true);
      expect(readFileSync(envPath, "utf8")).toContain(`LOCAL_LLM_MODEL_NAME=${selectedModel.modelName}`);
      expect(readFileSync(envPath, "utf8")).toContain(`LOCAL_LLM_MODEL_DIR=${modelDir}`);
      expect(readFileSync(envPath, "utf8")).toContain(`LOCAL_LLM_MODEL_PATH=${modelPath}`);
      expect(readFileSync(envPath, "utf8")).toContain("LOCAL_LLM_RUNTIME_PROVIDER=node-llama-cpp");

      expect(JSON.parse(readFileSync(configPath, "utf8"))).toMatchObject({
        translation: {
          model: selectedModel.modelName,
        },
      });
    } finally {
      stdoutWriteSpy.mockRestore();
    }
  });

  it("reuses an existing GGUF file without re-downloading it", async () => {
    const { cwd, home } = createWorkspace();
    vi.stubEnv("HOME", home);
    setTTY(true, true);
    const stdoutWriteSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const selectedModel = TRANSLATION_MODELS[0]!;
    const modelDir = getDetoksModelDir(selectedModel);
    const modelPath = getDetoksModelFilePath(selectedModel);
    mkdirSync(modelDir, { recursive: true });
    writeFileSync(modelPath, "GGUFseed", "utf8");
    mocks.selectModel.mockResolvedValue(selectedModel);

    try {
      await runModelSetupIfNeeded(cwd);

      const envPath = join(cwd, ".env");
      const configPath = join(home, ".detoks", "settings.json");

      expect(mocks.downloadModel).not.toHaveBeenCalled();
      expect(existsSync(envPath)).toBe(true);
      expect(existsSync(configPath)).toBe(true);
      expect(readFileSync(modelPath, "utf8")).toBe("GGUFseed");
      expect(readFileSync(envPath, "utf8")).toContain(
        `LOCAL_LLM_MODEL_PATH=${modelPath}`,
      );
      expect(readFileSync(envPath, "utf8")).toContain(
        "LOCAL_LLM_RUNTIME_PROVIDER=node-llama-cpp",
      );
      expect(JSON.parse(readFileSync(configPath, "utf8"))).toMatchObject({
        translation: {
          model: selectedModel.modelName,
        },
      });
      expect(stdoutWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining("모델이 이미 다운로드되어 있습니다."),
      );
    } finally {
      stdoutWriteSpy.mockRestore();
    }
  });
});

describe("TRANSLATION_MODELS", () => {
  it("includes the Qwen3.5-2B translation option", () => {
    const qwenModel = TRANSLATION_MODELS.find(
      (model) => model.modelName === "Qwen3.5-2B-GGUF",
    );

    expect(qwenModel).toMatchObject({
      id: "qwen35-2b",
      hfRepo: "lmstudio-community/Qwen3.5-2B-GGUF",
      hfFile: "Qwen3.5-2B-Q4_K_M.gguf",
    });
  });
});
