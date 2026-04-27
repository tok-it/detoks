import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadRole1Policies,
  loadRole1RuntimeConfig,
} from "../../../../../src/core/prompt/config.js";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "detoks-role1-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("loadRole1RuntimeConfig", () => {
  it("환경 변수가 없으면 기본값으로 로드한다", () => {
    const cwd = createTempDir();
    const config = loadRole1RuntimeConfig({ cwd, env: {} });

    expect(config.pipelineMode).toBe("safe");
    expect(config.requestTimeout).toBe(30000);
    expect(config.translationMaxAttempts).toBe(5);
    expect(config.temperature).toBe(0);
    expect(config.localLlmApiBase).toBe("http://127.0.0.1:12370/v1");
    expect(config.localLlmApiKey).toBeUndefined();
    expect(config.localLlmModelName).toBe(
      "mradermacher/gemma-4-E2B-it-heretic-ara-GGUF",
    );
    expect(config.localLlmAutoStart).toBe(true);
    expect(config.localLlmServerBinary).toBe("llama-server");
    expect(config.localLlmServerHost).toBe("127.0.0.1");
    expect(config.localLlmServerPort).toBe(12370);
    expect(config.localLlmGpuLayers).toBe("all");
    expect(config.localLlmHfRepo).toBe(
      "mradermacher/gemma-4-E2B-it-heretic-ara-GGUF:Q4_K_S",
    );
    expect(config.localLlmHfFile).toBe("gemma-4-E2B-it-heretic-ara.Q4_K_S.gguf");
  });

  it(".env와 legacy alias를 함께 읽는다", () => {
    const cwd = createTempDir();
    writeFileSync(
      join(cwd, ".env"),
      [
        "LM_STUDIO_URL=http://127.0.0.1:1234/v1",
        "LM_STUDIO_API_KEY=not-needed",
        "MODEL_NAME=legacy-local-model",
        "PIPELINE_MODE=debug",
        "REQUEST_TIMEOUT=15000",
        "TRANSLATION_MAX_ATTEMPTS=7",
        "TEMPERATURE=0.2",
      ].join("\n"),
      "utf8",
    );

    const config = loadRole1RuntimeConfig({ cwd, env: {} });

    expect(config.localLlmApiBase).toBe("http://127.0.0.1:1234/v1");
    expect(config.localLlmApiKey).toBe("not-needed");
    expect(config.localLlmModelName).toBe("legacy-local-model");
    expect(config.pipelineMode).toBe("debug");
    expect(config.requestTimeout).toBe(15000);
    expect(config.translationMaxAttempts).toBe(7);
    expect(config.temperature).toBe(0.2);
  });

  it("LOCAL_LLM_* env가 legacy alias보다 우선한다", () => {
    const cwd = createTempDir();
    writeFileSync(
      join(cwd, ".env"),
      [
        "OPENAI_API_BASE=http://127.0.0.1:1111/v1",
        "OPENAI_API_KEY=legacy-openai-key",
        "MODEL_NAME=legacy-model",
      ].join("\n"),
      "utf8",
    );

    const config = loadRole1RuntimeConfig({
      cwd,
      env: {
        LOCAL_LLM_API_BASE: "http://127.0.0.1:1234/v1",
        LOCAL_LLM_API_KEY: "local-llm-key",
        LOCAL_LLM_MODEL_NAME: "local-model",
      },
    });

    expect(config.localLlmApiBase).toBe("http://127.0.0.1:1234/v1");
    expect(config.localLlmApiKey).toBe("local-llm-key");
    expect(config.localLlmModelName).toBe("local-model");
  });

  it("process env가 .env 값보다 우선한다", () => {
    const cwd = createTempDir();
    writeFileSync(join(cwd, ".env"), "PIPELINE_MODE=safe\nREQUEST_TIMEOUT=1000", "utf8");

    const config = loadRole1RuntimeConfig({
      cwd,
      env: {
        PIPELINE_MODE: "debug",
        REQUEST_TIMEOUT: "2000",
      },
    });

    expect(config.pipelineMode).toBe("debug");
    expect(config.requestTimeout).toBe(2000);
  });
});

describe("loadRole1Policies", () => {
  it("정책 파일이 없으면 빈 정책을 반환한다", () => {
    const cwd = createTempDir();
    const policies = loadRole1Policies({ cwd });

    expect(policies).toEqual({
      protectedTerms: [],
      preferredTranslations: {},
      forbiddenPatterns: [],
    });
  });

  it("정책 파일이 있으면 검증 후 로드한다", () => {
    const cwd = createTempDir();
    const dataDir = join(cwd, "data");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      join(dataDir, "protected_terms.json"),
      JSON.stringify(["REST API", "GPT-4.1"]),
      "utf8",
    );
    writeFileSync(
      join(dataDir, "preferred_translations.json"),
      JSON.stringify({ "로그인": "login", "배포": "deploy" }),
      "utf8",
    );
    writeFileSync(
      join(dataDir, "forbidden_patterns.json"),
      JSON.stringify(["```", "^Here is"]),
      "utf8",
    );

    const policies = loadRole1Policies({ cwd });

    expect(policies.protectedTerms).toEqual(["REST API", "GPT-4.1"]);
    expect(policies.preferredTranslations).toEqual({
      로그인: "login",
      배포: "deploy",
    });
    expect(policies.forbiddenPatterns).toEqual(["```", "^Here is"]);
  });

  it("정책 파일 구조가 잘못되면 validation error를 던진다", () => {
    const cwd = createTempDir();
    const dataDir = join(cwd, "data");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      join(dataDir, "preferred_translations.json"),
      JSON.stringify(["invalid"]),
      "utf8",
    );

    expect(() => loadRole1Policies({ cwd })).toThrow(
      "Invalid policy file:",
    );
  });
});
