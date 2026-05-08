import { describe, expect, it, vi } from "vitest";
import {
  buildScriptEnv,
  parseArgs,
} from "../../../../scripts/verify-role1.js";

describe("verify-role1 script", () => {
  it("runtime provider 인자를 파싱한다", () => {
    const options = parseArgs([
      "--prompt",
      "새 파일을 생성해",
      "--runtime-provider",
      "node-llama-cpp",
      "--debug",
    ]);

    expect(options).toMatchObject({
      prompt: "새 파일을 생성해",
      runtimeProvider: "node-llama-cpp",
      debug: true,
    });
  });

  it("script env에 runtime provider override를 반영한다", () => {
    vi.stubEnv("PIPELINE_MODE", "safe");

    const env = buildScriptEnv({
      debug: true,
      runtimeProvider: "llama-server",
    });

    expect(env.PIPELINE_MODE).toBe("debug");
    expect(env.LOCAL_LLM_RUNTIME_PROVIDER).toBe("llama-server");
  });
});
