import { describe, expect, it } from "vitest";
import { buildLlamaServerArgs } from "../../../../../src/core/llm-client/local-runtime.js";

describe("buildLlamaServerArgs", () => {
  it("GGUF 경로가 있으면 해당 파일을 모델로 로드한다", () => {
    const args = buildLlamaServerArgs({
      localLlmModelPath: "/models/detoks.gguf",
      localLlmModelName: "detoks-local",
      localLlmServerHost: "127.0.0.1",
      localLlmServerPort: 12370,
      localLlmGpuLayers: "all",
      localLlmContextSize: 4096,
      localLlmReasoning: "off",
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
      "--gpu-layers",
      "all",
      "--ctx-size",
      "4096",
      "--reasoning",
      "off",
    ]);
  });

  it("GGUF 경로가 없으면 Hugging Face GGUF repo를 llama-server 다운로드 대상으로 넘긴다", () => {
    const args = buildLlamaServerArgs({
      localLlmHfRepo: "mradermacher/gemma-4-E2B-it-heretic-ara-GGUF:Q4_K_S",
      localLlmHfFile: "gemma-4-E2B-it-heretic-ara.Q4_K_S.gguf",
      localLlmModelName: "detoks-local",
      localLlmServerHost: "127.0.0.1",
      localLlmServerPort: 12370,
      localLlmGpuLayers: "all",
      localLlmContextSize: 4096,
      localLlmReasoning: "off",
      pipelineMode: "safe",
      requestTimeout: 30000,
      translationMaxAttempts: 5,
      temperature: 0,
    });

    expect(args).toEqual([
      "-hf",
      "mradermacher/gemma-4-E2B-it-heretic-ara-GGUF:Q4_K_S",
      "--hf-file",
      "gemma-4-E2B-it-heretic-ara.Q4_K_S.gguf",
      "--alias",
      "detoks-local",
      "--host",
      "127.0.0.1",
      "--port",
      "12370",
      "--gpu-layers",
      "all",
      "--ctx-size",
      "4096",
      "--reasoning",
      "off",
    ]);
  });

  it("device가 지정되면 llama.cpp device 인자를 추가한다", () => {
    const args = buildLlamaServerArgs({
      localLlmHfRepo: "mradermacher/gemma-4-E2B-it-heretic-ara-GGUF:Q4_K_S",
      localLlmHfFile: "gemma-4-E2B-it-heretic-ara.Q4_K_S.gguf",
      localLlmModelName: "detoks-local",
      localLlmServerHost: "127.0.0.1",
      localLlmServerPort: 12370,
      localLlmGpuLayers: "0",
      localLlmDevice: "none",
      localLlmContextSize: 4096,
      pipelineMode: "safe",
      requestTimeout: 30000,
      translationMaxAttempts: 5,
      temperature: 0,
    });

    expect(args).toContain("--device");
    expect(args).toContain("none");
    expect(args).toContain("--gpu-layers");
    expect(args).toContain("0");
  });
});
