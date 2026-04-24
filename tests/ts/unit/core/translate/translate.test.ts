import { describe, expect, it, vi } from "vitest";
import {
  clean_translation,
  translate_to_english,
} from "../../../../../src/core/translate/translate.js";

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
  });
});
