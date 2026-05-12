import { describe, expect, it, vi } from "vitest";
import { runBatchPromptPipeline } from "../../../../../src/core/pipeline/batch.js";

describe("runBatchPromptPipeline", () => {
  it("item 시작과 완료 progress를 순서대로 보고한다", async () => {
    const progressEvents: Array<{
      phase: "start" | "complete";
      current: number;
      total: number;
      summary: string;
      status?: string;
    }> = [];

    await runBatchPromptPipeline(
      ["Please create a new file", "Please create a new folder"],
      {
        env: {
          LOCAL_LLM_RUNTIME_PROVIDER: "llama-server",
          PIPELINE_MODE: "safe",
        },
        onProgress: (info) => {
          progressEvents.push({
            phase: info.phase,
            current: info.current,
            total: info.total,
            summary: info.summary,
            ...(info.result ? { status: info.result.status } : {}),
          });
        },
      },
    );

    expect(progressEvents).toEqual([
      {
        phase: "start",
        current: 1,
        total: 2,
        summary: "Please create a new file",
      },
      {
        phase: "complete",
        current: 1,
        total: 2,
        summary: "Please create a new file",
        status: "completed",
      },
      {
        phase: "start",
        current: 2,
        total: 2,
        summary: "Please create a new folder",
      },
      {
        phase: "complete",
        current: 2,
        total: 2,
        summary: "Please create a new folder",
        status: "completed",
      },
    ]);
  });

  it("batch 결과에 Role 1 / Role 2 handoff를 기록한다", async () => {
    const result = await runBatchPromptPipeline(["Please create a new file"], {
      env: {
        LOCAL_LLM_RUNTIME_PROVIDER: "llama-server",
        PIPELINE_MODE: "safe",
      },
    });

    expect(result.run_metadata.pipeline_mode).toBe("safe");
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.compiled_prompt).toBe("Create a new file");
    expect(result.results[0]?.role2_handoff).toBe("Please create a new file");
    expect(result.results[0]?.status).toBe("completed");
    expect(result.results[0]?.inference_time_sec).toBe(0);
  });

  it("debug mode에서는 translation debug 메타데이터를 남긴다", async () => {
    const fetchImplementation = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "Create __PH_0001__ file",
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    const result = await runBatchPromptPipeline(["새 `config.ts` 파일을 생성해"], {
      env: {
        LOCAL_LLM_RUNTIME_PROVIDER: "llama-server",
        LOCAL_LLM_API_BASE: "http://127.0.0.1:1234/v1",
        LOCAL_LLM_API_KEY: "test-key",
        LOCAL_LLM_MODEL_NAME: "local-model",
        LOCAL_LLM_RUNTIME_PROVIDER: "llama-server",
        PIPELINE_MODE: "debug",
        TRANSLATION_MAX_ATTEMPTS: "1",
      },
      fetchImplementation,
    });

    expect(result.run_metadata.pipeline_mode).toBe("debug");
    expect(result.results[0]?.debug?.masked_text).toContain("__PH_0001__");
    expect(result.results[0]?.debug?.placeholders).toHaveLength(1);
    expect(result.results[0]?.debug?.fallback_span_count).toBe(0);
  });

  it("실패 item을 drop하지 않고 결과에 남긴다", async () => {
    const fetchImplementation = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          invalid: true,
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    const result = await runBatchPromptPipeline(
      ["Please create a new file", "새 파일을 생성해"],
      {
        env: {
          LOCAL_LLM_RUNTIME_PROVIDER: "llama-server",
          LOCAL_LLM_API_BASE: "http://127.0.0.1:1234/v1",
          LOCAL_LLM_API_KEY: "test-key",
          LOCAL_LLM_MODEL_NAME: "local-model",
          LOCAL_LLM_RUNTIME_PROVIDER: "llama-server",
          PIPELINE_MODE: "safe",
          TRANSLATION_MAX_ATTEMPTS: "1",
        },
        fetchImplementation,
      },
    );

    expect(result.results).toHaveLength(2);
    expect(result.results[0]?.status).toBe("completed");
    expect(result.results[1]?.status).toBe("failed");
    expect(result.results[1]?.error).toContain(
      "Invalid LLM response: missing choices[0]",
    );
    expect(result.results[1]?.raw_input).toBe("새 파일을 생성해");
  });
});
