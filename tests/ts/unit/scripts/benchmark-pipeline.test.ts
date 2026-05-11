import { describe, expect, it } from "vitest";
import {
  buildScriptEnv,
  parseArgs,
} from "../../../../scripts/benchmark-pipeline.js";

describe("benchmark script", () => {
  it("runtime provider 인자를 파싱한다", () => {
    const args = parseArgs([
      "--input",
      "테스트 입력",
      "--runtime-provider",
      "node-llama-cpp",
      "--adapter",
      "codex",
      "--execution-mode",
      "stub",
    ]);

    expect(args).toMatchObject({
      input: "테스트 입력",
      runtimeProvider: "node-llama-cpp",
      adapter: "codex",
      executionMode: "stub",
    });
  });

  it("script env에 runtime provider override를 반영한다", () => {
    const env = buildScriptEnv({
      runtimeProvider: "node-llama-cpp",
    });

    expect(env.LOCAL_LLM_RUNTIME_PROVIDER).toBe("node-llama-cpp");
  });
});
