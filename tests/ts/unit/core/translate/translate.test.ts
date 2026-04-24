import { describe, expect, it, vi } from "vitest";
import { translate_to_english } from "../../../../../src/core/translate/translate.js";
import { clean_translation } from "../../../../../src/core/translate/clean.js";

describe("clean_translation", () => {
  it("meta label, outer quote, code fence를 제거한다", () => {
    const cleaned = clean_translation(
      "파일을 생성해",
      '```text\nTranslation: "Create a file"\n```',
    );

    expect(cleaned).toBe("Create a file");
  });
});

describe("translate_to_english", () => {
  it("placeholder를 보존하면서 한국어 span만 번역한다", async () => {
    const fetchImplementation = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'Translation: "Create a file named __PH_0001__"',
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

    const result = await translate_to_english("`app.ts` 파일을 생성해", {
      config: {
        openaiApiBase: "http://127.0.0.1:1234/v1",
        openaiApiKey: "test-key",
        modelName: "local-model",
        pipelineMode: "safe",
        requestTimeout: 30000,
        translationMaxAttempts: 5,
        temperature: 0,
      },
      policies: {
        protectedTerms: [],
        preferredTranslations: {},
        forbiddenPatterns: [],
      },
      fetchImplementation,
    });

    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(result.text).toBe("Create a file named `app.ts`");
    expect(result.placeholders[0]!.original).toBe("`app.ts`");
    expect(result.raw_responses).toHaveLength(1);
    expect(result.fallback_span_count).toBe(0);
    expect(result.span_results[0]!.status).toBe("translated");
  });

  it("영문 입력 span은 LLM 호출 없이 그대로 유지한다", async () => {
    const fetchImplementation = vi.fn();

    const result = await translate_to_english("Create a file", {
      config: {
        openaiApiBase: "http://127.0.0.1:1234/v1",
        openaiApiKey: "test-key",
        modelName: "local-model",
        pipelineMode: "safe",
        requestTimeout: 30000,
        translationMaxAttempts: 5,
        temperature: 0,
      },
      policies: {
        protectedTerms: [],
        preferredTranslations: {},
        forbiddenPatterns: [],
      },
      fetchImplementation,
    });

    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(result.text).toBe("Create a file");
    expect(result.span_results[0]!.status).toBe("skipped");
  });

  it("검증 실패 span은 fallback으로 재시도하고 성공 metadata를 남긴다", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "여기 번역: 파일을 생성해",
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
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Create a file",
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
        ),
      );

    const result = await translate_to_english("파일을 생성해", {
      config: {
        openaiApiBase: "http://127.0.0.1:1234/v1",
        openaiApiKey: "test-key",
        modelName: "local-model",
        pipelineMode: "safe",
        requestTimeout: 30000,
        translationMaxAttempts: 2,
        temperature: 0,
      },
      policies: {
        protectedTerms: [],
        preferredTranslations: {},
        forbiddenPatterns: ["여기 번역"],
      },
      fetchImplementation,
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(result.text).toBe("Create a file");
    expect(result.fallback_span_count).toBe(1);
    expect(result.span_results[0]!.status).toBe("fallback_succeeded");
    expect(result.span_results[0]!.attempts).toBe(2);
  });

  it("재시도 제한을 넘기지 않고 실패 metadata를 남긴다", async () => {
    const fetchImplementation = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "파일을 생성해",
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

    const result = await translate_to_english("파일을 생성해", {
      config: {
        openaiApiBase: "http://127.0.0.1:1234/v1",
        openaiApiKey: "test-key",
        modelName: "local-model",
        pipelineMode: "safe",
        requestTimeout: 30000,
        translationMaxAttempts: 1,
        temperature: 0,
      },
      policies: {
        protectedTerms: [],
        preferredTranslations: {},
        forbiddenPatterns: [],
      },
      fetchImplementation,
    });

    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(result.span_results[0]!.status).toBe("failed");
    expect(result.span_results[0]!.attempts).toBe(1);
    expect(result.span_results[0]!.validation_errors).toContain(
      "korean_text_remaining",
    );
  });
});
