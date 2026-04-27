import { describe, expect, it } from "vitest";
import { buildLlamaServerArgs } from "../../../../../src/core/llm-client/local-runtime.js";

describe("buildLlamaServerArgs", () => {
  it("GGUF 경로가 있으면 해당 파일을 모델로 로드한다", () => {
    const args = buildLlamaServerArgs({
      localLlmModelPath: "/models/detoks.gguf",
      localLlmModelName: "detoks-local",
      localLlmServerHost: "127.0.0.1",
      localLlmServerPort: 12370,
      pipelineMode: "safe",
      requestTimeout: 30000,
      translationMaxAttempts: 5,
      temperature: 0,
    });

    expect(args).toEqual([
      "-m",
      "/models/detoks.gguf",
      "--alias",
      "detoks-local",
      "--host",
      "127.0.0.1",
      "--port",
      "12370",
    ]);
  });

  it("GGUF 경로가 없으면 Hugging Face GGUF repo를 llama-server 다운로드 대상으로 넘긴다", () => {
    const args = buildLlamaServerArgs({
      localLlmHfRepo: "mradermacher/gemma-4-E2B-it-heretic-ara-GGUF",
      localLlmModelName: "detoks-local",
      localLlmServerHost: "127.0.0.1",
      localLlmServerPort: 12370,
      pipelineMode: "safe",
      requestTimeout: 30000,
      translationMaxAttempts: 5,
      temperature: 0,
    });

    expect(args).toEqual([
      "-hf",
      "mradermacher/gemma-4-E2B-it-heretic-ara-GGUF",
      "--alias",
      "detoks-local",
      "--host",
      "127.0.0.1",
      "--port",
      "12370",
    ]);
  });
});
