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
        },
        fetchImplementation,
      },
    );

    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(compiled.language).toBe("ko");
    expect(compiled.normalized_input).toBe("Create a new file");
    expect(compiled.compressed_prompt).toBe("Create a new file");
  });
});
