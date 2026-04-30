import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runModelResetCommand } from "../../../../src/cli/commands/model-reset.js";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "detoks-model-reset-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }

  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("runModelResetCommand", () => {
  it("모델 관련 .env 값과 설정만 초기화하고 gguf 파일은 유지한다", () => {
    const root = createTempDir();
    const cwd = join(root, "project");
    const home = join(root, "home");
    const modelDir = join(home, ".detoks", "models");
    const ggufPath = join(modelDir, "stale-model.gguf");
    const envPath = join(cwd, ".env");
    const envLocalPath = join(cwd, ".env.local");
    const configPath = join(home, ".detoks", "settings.json");

    mkdirSync(cwd, { recursive: true });
    mkdirSync(modelDir, { recursive: true });
    writeFileSync(
      envPath,
      [
        "LOCAL_LLM_MODEL_NAME=stale-model",
        "LOCAL_LLM_MODEL_DIR=/custom/models",
        "LOCAL_LLM_MODEL_PATH=/custom/models/stale-model.gguf",
        "LOCAL_LLM_HF_REPO=repo/model",
        "LOCAL_LLM_HF_FILE=stale-model.gguf",
        "OTHER_VALUE=kept",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      envLocalPath,
      [
        "MODEL_NAME=legacy-stale-model",
        "LOCAL_LLM_MODEL_NAME=override-model",
        "LOCAL_LLM_MODEL_PATH=/override/override-model.gguf",
        "LOCAL_LLM_HF_REPO=override/repo",
        "LOCAL_LLM_HF_FILE=override-model.gguf",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(ggufPath, "GGUF", "utf8");
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          version: "1.0",
          lastUpdated: "2026-04-30T00:00:00.000Z",
          adapter: {
            selected: "codex",
            models: {
              codex: undefined,
              gemini: undefined,
            },
          },
          translation: {
            model: "override-model",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    vi.stubEnv("HOME", home);
    vi.stubEnv("LOCAL_LLM_MODEL_NAME", "stale-model");
    vi.stubEnv("MODEL_NAME", "legacy-stale-model");
    vi.stubEnv("LOCAL_LLM_MODEL_PATH", "/custom/models/stale-model.gguf");
    vi.stubEnv("LOCAL_LLM_HF_REPO", "repo/model");
    vi.stubEnv("LOCAL_LLM_HF_FILE", "stale-model.gguf");

    const result = runModelResetCommand(cwd);

    expect(result).toEqual({
      ok: true,
      mode: "model-reset",
      reset: true,
      mutatesState: true,
      message: "번역 모델 설정을 초기화했습니다. GGUF 파일은 삭제하지 않았습니다.",
    });
    expect(process.env.LOCAL_LLM_MODEL_NAME).toBeUndefined();
    expect(process.env.MODEL_NAME).toBeUndefined();
    expect(process.env.LOCAL_LLM_MODEL_PATH).toBeUndefined();
    expect(process.env.LOCAL_LLM_HF_REPO).toBeUndefined();
    expect(process.env.LOCAL_LLM_HF_FILE).toBeUndefined();
    expect(readFileSync(envPath, "utf8")).toContain("OTHER_VALUE=kept");
    expect(readFileSync(envPath, "utf8")).not.toContain("LOCAL_LLM_MODEL_NAME");
    expect(readFileSync(envPath, "utf8")).not.toContain("MODEL_NAME");
    expect(readFileSync(envPath, "utf8")).not.toContain("LOCAL_LLM_MODEL_PATH");
    expect(readFileSync(envLocalPath, "utf8")).not.toContain("LOCAL_LLM_MODEL_NAME");
    expect(readFileSync(envLocalPath, "utf8")).not.toContain("MODEL_NAME");
    expect(readFileSync(envLocalPath, "utf8")).not.toContain("LOCAL_LLM_MODEL_PATH");
    expect(readFileSync(ggufPath, "utf8")).toBe("GGUF");

    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      translation?: { model?: string };
    };
    expect(config.translation?.model).toBeUndefined();
  });

  it("초기화할 모델 설정이 없으면 idempotent success를 반환한다", () => {
    const root = createTempDir();
    const cwd = join(root, "project");
    const home = join(root, "home");
    const configPath = join(home, ".detoks", "settings.json");

    mkdirSync(cwd, { recursive: true });
    mkdirSync(join(home, ".detoks"), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          version: "1.0",
          lastUpdated: "2026-04-30T00:00:00.000Z",
          adapter: {
            selected: "codex",
            models: {
              codex: undefined,
              gemini: undefined,
            },
          },
          translation: {},
        },
        null,
        2,
      ),
      "utf8",
    );

    vi.stubEnv("HOME", home);

    const result = runModelResetCommand(cwd);

    expect(result).toEqual({
      ok: true,
      mode: "model-reset",
      reset: false,
      mutatesState: false,
      message: "초기화할 번역 모델 설정이 없습니다. GGUF 파일은 유지했습니다.",
    });
    expect(JSON.parse(readFileSync(configPath, "utf8"))).toMatchObject({
      translation: {},
    });
  });
});
