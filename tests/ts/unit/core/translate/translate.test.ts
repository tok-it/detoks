import { afterEach, describe, expect, it, vi } from "vitest";

const nodeRuntimeMocks = vi.hoisted(() => ({
  completeChatWithNodeLlamaCpp: vi.fn(),
}));

vi.mock(
  "../../../../../src/core/llm-client/node-llama-runtime.js",
  () => nodeRuntimeMocks,
);

import { translate_to_english } from "../../../../../src/core/translate/translate.js";
import { clean_translation } from "../../../../../src/core/translate/clean.js";

function mockNodeResponses(...contents: string[]): void {
  for (const content of contents) {
    nodeRuntimeMocks.completeChatWithNodeLlamaCpp.mockResolvedValueOnce({
      content,
      raw_response: { choices: [{ message: { content } }] },
      inference_time_sec: 0.01,
    });
  }
}

afterEach(() => {
  nodeRuntimeMocks.completeChatWithNodeLlamaCpp.mockReset();
});

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
    mockNodeResponses('Translation: "Create a file named __PH_0001__"');
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
        localLlmApiBase: "http://127.0.0.1:1234/v1",
        localLlmApiKey: "test-key",
        localLlmModelName: "local-model",
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
    expect(nodeRuntimeMocks.completeChatWithNodeLlamaCpp).toHaveBeenCalledOnce();
    expect(result.text).toBe("Create a file named `app.ts`");
    expect(result.placeholders[0]!.original).toBe("`app.ts`");
    expect(result.raw_responses).toHaveLength(1);
    expect(result.fallback_span_count).toBe(0);
    expect(result.span_results[0]!.status).toBe("translated");
    expect(result.validation_errors).toEqual([]);
  });

  it("영문 입력 span은 LLM 호출 없이 그대로 유지한다", async () => {
    const fetchImplementation = vi.fn();

    const result = await translate_to_english("Create a file", {
      config: {
        localLlmApiBase: "http://127.0.0.1:1234/v1",
        localLlmApiKey: "test-key",
        localLlmModelName: "local-model",
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
    expect(nodeRuntimeMocks.completeChatWithNodeLlamaCpp).not.toHaveBeenCalled();
    expect(result.text).toBe("Create a file");
    expect(result.span_results[0]!.status).toBe("skipped");
    expect(result.debug).toBeUndefined();
  });

  it("검증 실패 span은 fallback으로 재시도하고 성공 metadata를 남긴다", async () => {
    mockNodeResponses("여기 번역: 파일을 생성해", "Create a file");
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
        localLlmApiBase: "http://127.0.0.1:1234/v1",
        localLlmApiKey: "test-key",
        localLlmModelName: "local-model",
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

    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(nodeRuntimeMocks.completeChatWithNodeLlamaCpp).toHaveBeenCalledTimes(2);
    expect(result.text).toBe("Create a file");
    expect(result.fallback_span_count).toBe(1);
    expect(result.span_results[0]!.status).toBe("fallback_succeeded");
    expect(result.span_results[0]!.attempts).toBe(2);
  });

  it("재시도 제한을 넘기지 않고 실패 metadata를 남긴다", async () => {
    mockNodeResponses("파일을 생성해", "파일을 생성해");
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
        localLlmApiBase: "http://127.0.0.1:1234/v1",
        localLlmApiKey: "test-key",
        localLlmModelName: "local-model",
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

    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(nodeRuntimeMocks.completeChatWithNodeLlamaCpp).toHaveBeenCalledTimes(2);
    expect(result.span_results[0]!.status).toBe("failed");
    expect(result.span_results[0]!.attempts).toBe(1);
    expect(result.span_results[0]!.validation_errors).toContain(
      "korean_text_remaining",
    );
  });

  it("debug mode에서는 debug metadata를 남긴다", async () => {
    mockNodeResponses("Create __PH_0001__ file");
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

    const result = await translate_to_english("`app.ts` 파일 생성", {
      config: {
        localLlmApiBase: "http://127.0.0.1:1234/v1",
        localLlmApiKey: "test-key",
        localLlmModelName: "local-model",
        pipelineMode: "debug",
        requestTimeout: 30000,
        translationMaxAttempts: 2,
        temperature: 0,
      },
      policies: {
        protectedTerms: [],
        preferredTranslations: {},
        forbiddenPatterns: [],
      },
      fetchImplementation,
    });

    expect(result.debug).toBeDefined();
    expect(result.debug!.masked_text).toContain("__PH_0001__");
    expect(result.debug!.placeholders[0]!.original).toBe("`app.ts`");
    expect(result.debug!.fallback_span_count).toBe(0);
  });

  it("깨진 placeholder 형식도 repair로 복구하고 최종 validation 오류는 남기지 않는다", async () => {
    mockNodeResponses("Check PH_0001__ endpoint first");
    const fetchImplementation = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "Check PH_0001__ endpoint first",
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

    const result = await translate_to_english("`endpoint.ts` 엔드포인트 확인", {
      config: {
        localLlmApiBase: "http://127.0.0.1:1234/v1",
        localLlmApiKey: "test-key",
        localLlmModelName: "local-model",
        pipelineMode: "safe",
        requestTimeout: 30000,
        translationMaxAttempts: 2,
        temperature: 0,
      },
      policies: {
        protectedTerms: [],
        preferredTranslations: {},
        forbiddenPatterns: [],
      },
      fetchImplementation,
    });

    expect(result.text).toBe("Check `endpoint.ts` endpoint first");
    expect(result.span_results[0]!.output_text).toContain("__PH_0001__");
    expect(result.validation_errors).toEqual([]);
  });

  it("placeholder가 포함된 span은 정확한 placeholder 힌트를 프롬프트에 포함한다", async () => {
    mockNodeResponses(
      "Let's create an endpoint and expose the metric data externally.",
      "Let's create __PH_0001__ endpoint and expose the metric data externally.",
    );
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Let's create an endpoint and expose the metric data externally.",
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
                  content: "Let's create __PH_0001__ endpoint and expose the metric data externally.",
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

    const result = await translate_to_english(
      "__PH_0001__ 엔드포인트를 만들어서 메트릭 데이터를 외부에 노출하자.",
      {
        config: {
          localLlmApiBase: "http://127.0.0.1:1234/v1",
          localLlmApiKey: "test-key",
          localLlmModelName: "local-model",
          pipelineMode: "safe",
          requestTimeout: 30000,
          translationMaxAttempts: 2,
          temperature: 0,
        },
        policies: {
          protectedTerms: [],
          preferredTranslations: {},
          forbiddenPatterns: [],
        },
        fetchImplementation,
      },
    );

    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(nodeRuntimeMocks.completeChatWithNodeLlamaCpp).toHaveBeenCalledTimes(2);
    const firstCall = nodeRuntimeMocks.completeChatWithNodeLlamaCpp.mock.calls[0]!;
    const secondCall = nodeRuntimeMocks.completeChatWithNodeLlamaCpp.mock.calls[1]!;
    const firstBody = firstCall[0];
    const secondBody = secondCall[0];

    expect(firstBody.messages[0].content).toContain(
      "Exact placeholders that must be preserved verbatim",
    );
    expect(firstBody.messages[0].content).toContain("__PH_0001__");
    expect(secondBody.messages[0].content).toContain(
      "Fallback Correction Mode",
    );
    expect(secondBody.messages[0].content).toContain(
      "Non-Negotiable Placeholder Rules",
    );
    expect(secondBody.messages[0].content).toContain(
      "Every placeholder from the source input must appear in the output exactly as written.",
    );
    expect(secondBody.messages[0].content).toContain("__PH_0001__");
    expect(result.text).toContain("__PH_0001__");
    expect(result.validation_errors).toEqual([]);
  });

  it("final retry에서는 cluster된 placeholder를 single-call segmented retry로 복구한다", async () => {
    mockNodeResponses(
      "Compare them carefully.",
      "Compare them carefully.",
      ["SEG_0001|||PLACEHOLDER|||", "SEG_0002|||TEXT||| Compare them carefully."].join("\n"),
    );
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Compare them carefully.",
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
                  content: "Compare them carefully.",
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
                  content: [
                    "SEG_0001|||PLACEHOLDER|||",
                    "SEG_0002|||TEXT||| Compare them carefully.",
                  ].join("\n"),
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

    const result = await translate_to_english("__PH_0001__ __PH_0002__ 를 비교해", {
      config: {
        localLlmApiBase: "http://127.0.0.1:1234/v1",
        localLlmApiKey: "test-key",
        localLlmModelName: "local-model",
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

    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(nodeRuntimeMocks.completeChatWithNodeLlamaCpp).toHaveBeenCalledTimes(3);
    const segmentedRetryCall =
      nodeRuntimeMocks.completeChatWithNodeLlamaCpp.mock.calls[2]![0];
    expect(segmentedRetryCall.messages[0].content).toContain(
      "Placeholder Segment Recovery Mode",
    );
    expect(segmentedRetryCall.messages[1].content).toContain("__PHC_0001__");
    expect(result.masked_text).toContain("__PHC_0001__");
    expect(result.text).toBe("__PH_0001__ __PH_0002__ Compare them carefully.");
    expect(result.repair_actions).toContain("placeholder_inserted:__PHC_0001__");
    expect(result.validation_errors).toEqual([]);
  });

  it("최종 retry는 placeholder를 잃은 결과보다 placeholder를 보존한 결과를 우선한다", async () => {
    mockNodeResponses(
      "__PH_0001__ 서비스 뒤가 느려",
      "The service behind the gateway is slow.",
      "unstructured retry output",
    );
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "__PH_0001__ 서비스 뒤가 느려",
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
                  content: "The service behind the gateway is slow.",
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
                  content: "unstructured retry output",
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

    const result = await translate_to_english("API 뒤 서비스가 느려", {
      config: {
        localLlmApiBase: "http://127.0.0.1:1234/v1",
        localLlmApiKey: "test-key",
        localLlmModelName: "local-model",
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

    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(nodeRuntimeMocks.completeChatWithNodeLlamaCpp).toHaveBeenCalledTimes(3);
    expect(result.text).toBe("API 서비스 뒤가 느려");
    expect(result.span_results[0]!.validation_errors).not.toContain(
      "placeholder_count_mismatch",
    );
    expect(result.validation_errors).toContain("korean_text_remaining");
  });

  it("placeholder가 통째로 사라지면 item 단위로 재시도한다", async () => {
    mockNodeResponses(
      "Create a file named app.ts",
      "Create a file named __PH_0001__",
    );
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Create a file named app.ts",
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
                  content: "Create a file named __PH_0001__",
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

    const result = await translate_to_english("`app.ts` 파일을 생성해", {
      config: {
        localLlmApiBase: "http://127.0.0.1:1234/v1",
        localLlmApiKey: "test-key",
        localLlmModelName: "local-model",
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

    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(nodeRuntimeMocks.completeChatWithNodeLlamaCpp).toHaveBeenCalledTimes(2);
    expect(result.text).toBe("Create a file named `app.ts`");
    expect(result.validation_errors).toEqual([]);
  });

  it("최종 validation에서 literal 누락이 나면 item 단위로 한 번 더 재호출한다", async () => {
    mockNodeResponses(
      "Create a file",
      "Create a file named __PH_0001__",
    );
    const fetchImplementation = vi
      .fn()
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Create a file named __PH_0001__",
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

    const result = await translate_to_english("`app.ts` 파일을 생성해", {
      config: {
        localLlmApiBase: "http://127.0.0.1:1234/v1",
        localLlmApiKey: "test-key",
        localLlmModelName: "local-model",
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

    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(nodeRuntimeMocks.completeChatWithNodeLlamaCpp).toHaveBeenCalledTimes(2);
    expect(result.text).toBe("Create a file named `app.ts`");
    expect(result.validation_errors).toEqual([]);
  });

  it("저신뢰 placeholder literal은 최종 validation에서 강제하지 않는다", async () => {
    mockNodeResponses("The services behind the gateway are too slow.");
    const fetchImplementation = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "The services behind the gateway are too slow.",
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

    const result = await translate_to_english(
      "API Gateway 뒤에서 돌아가는 서비스들이 너무 느려",
      {
        config: {
          localLlmApiBase: "http://127.0.0.1:1234/v1",
          localLlmApiKey: "test-key",
          localLlmModelName: "local-model",
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
      },
    );

    expect(result.text).toBe("The services behind the gateway are too slow.");
    expect(result.validation_errors).not.toContain(
      "required_literal_missing:API",
    );
  });
});
