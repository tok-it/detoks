import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildScriptEnv,
  ensureRole1ModelFile,
  parseArgs,
  renderBatchProgressMessage,
} from "../../../../scripts/verify-role1.js";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("verify-role1 script", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

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
      runtimeProvider: "node-llama-cpp",
    });

    expect(env.PIPELINE_MODE).toBe("debug");
    expect(env.LOCAL_LLM_RUNTIME_PROVIDER).toBe("node-llama-cpp");
  });

  it("모델 파일이 없으면 huggingface에서 내려받아 경로를 세팅한다", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "detoks-role1-"));
    const modelPath = join(tempDir, "role1-model.gguf");
    const fetchMock = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Buffer.from("GGUF"));
          controller.enqueue(Buffer.from("mock-model"));
          controller.close();
        },
      });

      return new Response(body, {
        headers: {
          "content-length": String("GGUFmock-model".length),
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
      writes.push(
        typeof chunk === "string"
          ? chunk
          : Buffer.from(chunk as Uint8Array).toString("utf8"),
      );
      return true;
    }) as typeof process.stdout.write);

    const env: NodeJS.ProcessEnv = {};

    try {
      const resolvedPath = await ensureRole1ModelFile(
        {
          localLlmModelDir: tempDir,
          localLlmHfRepo: "example/repo",
          localLlmHfFile: "role1-model.gguf",
          localLlmRuntimeProvider: "node-llama-cpp",
        },
        env,
      );

      expect(resolvedPath).toBe(modelPath);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://huggingface.co/example/repo/resolve/main/role1-model.gguf",
      );
      expect(writes.some((line) => line.includes("모델 다운로드 중"))).toBe(
        true,
      );
      expect(writes.some((line) => line.includes("진행률"))).toBe(true);
      expect(writes.some((line) => line.includes("모델 다운로드 완료"))).toBe(
        true,
      );
      expect(readFileSync(modelPath, "utf8")).toBe("GGUFmock-model");
      expect(env.LOCAL_LLM_MODEL_PATH).toBe(modelPath);
      expect(env.LOCAL_LLM_RUNTIME_PROVIDER).toBe("node-llama-cpp");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("이미 있는 모델 파일은 다시 받지 않는다", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "detoks-role1-"));
    const modelPath = join(tempDir, "cached-model.gguf");
    writeFileSync(modelPath, "GGUFcached-model", "utf8");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const env: NodeJS.ProcessEnv = {};

    try {
      const resolvedPath = await ensureRole1ModelFile(
        {
          localLlmModelPath: modelPath,
          localLlmRuntimeProvider: "node-llama-cpp",
        },
        env,
      );

      expect(resolvedPath).toBe(modelPath);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(env.LOCAL_LLM_MODEL_PATH).toBe(modelPath);
      expect(env.LOCAL_LLM_RUNTIME_PROVIDER).toBe("node-llama-cpp");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("배치 진행률 메시지를 즉시 출력할 수 있다", () => {
    expect(
      renderBatchProgressMessage({
        phase: "start",
        index: 0,
        current: 1,
        total: 106,
        raw_input: "새 파일을 생성해",
        summary: "새 파일을 생성해",
      }),
    ).toBe("(1/106) Processing 새 파일을 생성해...");

    expect(
      renderBatchProgressMessage({
        phase: "complete",
        index: 0,
        current: 1,
        total: 106,
        raw_input: "새 파일을 생성해",
        summary: "새 파일을 생성해",
        result: {
          index: 0,
          raw_input: "새 파일을 생성해",
          status: "completed",
          validation_errors: [],
          repair_actions: [],
          inference_time_sec: 1.234,
        },
      }),
    ).toBe("  inference : 1234ms");
  });
});
