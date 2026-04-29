import { describe, expect, it, vi } from "vitest";
import { runBatchPromptPipeline } from "../../../../../src/core/pipeline/batch.js";

describe("runBatchPromptPipeline", () => {
  it("progress callback를 아이템 완료마다 호출한다", async () => {
    const onItemComplete = vi.fn();

    const result = await runBatchPromptPipeline(["Please create a new file"], {
      env: {
        PIPELINE_MODE: "safe",
      },
      onItemComplete,
    });

    expect(result.results).toHaveLength(1);
    expect(onItemComplete).toHaveBeenCalledTimes(1);
    expect(onItemComplete).toHaveBeenCalledWith({
      current: 1,
      remaining: 0,
      rawInput: "Please create a new file",
      summary: "Please create a new file",
      inferenceTimeMs: 0,
    });
  });

  it("긴 입력은 progress summary로 잘라서 전달한다", async () => {
    const onItemComplete = vi.fn();
    const longPrompt =
      "Please create a new file and then add detailed validation, logging, rollback handling, monitoring hooks, and a concise summary for operators.";

    await runBatchPromptPipeline([longPrompt], {
      env: {
        PIPELINE_MODE: "safe",
      },
      onItemComplete,
    });

    const call = onItemComplete.mock.calls[0]?.[0];
    expect(call.summary).not.toBe(longPrompt);
    expect(call.summary.length).toBeLessThan(longPrompt.length);
    expect(call.summary.endsWith("...")).toBe(true);
  });

  it("batch 결과에 Role 1 / Role 2 handoff를 기록한다", async () => {
    const result = await runBatchPromptPipeline(["Please create a new file"], {
      env: {
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
        LOCAL_LLM_API_BASE: "http://127.0.0.1:1234/v1",
        LOCAL_LLM_API_KEY: "test-key",
        LOCAL_LLM_MODEL_NAME: "local-model",
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
          LOCAL_LLM_API_BASE: "http://127.0.0.1:1234/v1",
          LOCAL_LLM_API_KEY: "test-key",
          LOCAL_LLM_MODEL_NAME: "local-model",
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
