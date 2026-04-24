import { describe, expect, it, vi } from "vitest";
import {
  compilePrompt,
  createRole2PromptInput,
} from "../../../../../src/core/prompt/compiler.js";
import {
  CompiledPromptSchema,
  PromptCompileResponseSchema,
  Role2PromptInputSchema,
} from "../../../../../src/schemas/pipeline.js";

describe("compilePrompt", () => {
  it("Role 1 응답과 Role 2.1 handoff를 공식 스키마로 생성한다", async () => {
    const compiled = await compilePrompt({
      raw_input: "  Find the auth module.\n\nAnalyze the flow.  ",
    });
    const handoff = createRole2PromptInput(compiled);

    expect(CompiledPromptSchema.parse(compiled)).toEqual(compiled);
    expect(PromptCompileResponseSchema.parse(compiled)).toEqual(compiled);
    expect(Role2PromptInputSchema.parse(handoff)).toEqual(handoff);
    expect(compiled.normalized_input).toBe("Find the auth module.\n\nAnalyze the flow.");
    expect(compiled.compression_provider).toBe("nlp_adapter");
    expect(handoff.compiled_prompt).toBe(compiled.compressed_prompt);
  });

  it("영문 입력은 en으로 판정한다", async () => {
    const compiled = await compilePrompt({
      raw_input: "Create a new endpoint",
    });

    expect(compiled.language).toBe("en");
  });

  it("영문 입력은 보수적으로 압축하되 핵심 토큰을 보존한다", async () => {
    const compiled = await compilePrompt({
      raw_input:
        "Can you please update src/api/user.ts and run npm test -- --runInBand 2 times?",
    });

    expect(compiled.language).toBe("en");
    expect(compiled.compressed_prompt).toBe(
      "Update src/api/user.ts and run npm test -- --runInBand 2 times?",
    );
    expect(compiled.repair_actions ?? []).toContain("compressed_with_nlp_adapter");
  });

  it("지원하지 않는 압축 provider는 오류를 반환한다", async () => {
    await expect(
      compilePrompt({
        raw_input: "Create a new endpoint",
        compression_provider: "llm",
      }),
    ).rejects.toThrow("Unsupported prompt compression provider: llm");
  });

  it("한국어 입력은 번역 경계를 통해 영문 normalized_input을 만든다", async () => {
    const fetchImplementation = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "Create a new file",
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

    const compiled = await compilePrompt(
      {
        raw_input: "새 파일을 생성해",
      },
      {
        env: {
          OPENAI_API_BASE: "http://127.0.0.1:1234/v1",
          OPENAI_API_KEY: "test-key",
          MODEL_NAME: "local-model",
          TRANSLATION_MAX_ATTEMPTS: "1",
        },
        fetchImplementation,
      },
    );

    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(compiled.language).toBe("ko");
    expect(compiled.normalized_input).toBe("Create a new file");
    expect(compiled.compressed_prompt).toBe("Create a new file");
  });

  it("검증 실패가 있으면 validation_errors와 repair_actions를 응답에 남긴다", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Translation: 새 파일을 생성해",
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

    const compiled = await compilePrompt(
      {
        raw_input: "새 파일을 생성해",
      },
      {
        env: {
          OPENAI_API_BASE: "http://127.0.0.1:1234/v1",
          OPENAI_API_KEY: "test-key",
          MODEL_NAME: "local-model",
          TRANSLATION_MAX_ATTEMPTS: "1",
        },
        fetchImplementation,
      },
    );

    expect(compiled.validation_errors).toContain("korean_text_remaining");
    expect(compiled.repair_actions ?? []).toContain(
      "compression_fallback_to_normalized_input",
    );
  });
});
