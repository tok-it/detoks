import { describe, expect, it } from "vitest";
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
  it("Role 1 응답과 Role 2.1 handoff를 공식 스키마로 생성한다", () => {
    const compiled = compilePrompt({
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

  it("영문 입력은 en으로 판정한다", () => {
    const compiled = compilePrompt({
      raw_input: "Create a new endpoint",
    });

    expect(compiled.language).toBe("en");
  });

  it("지원하지 않는 압축 provider는 오류를 반환한다", () => {
    expect(() =>
      compilePrompt({
        raw_input: "Create a new endpoint",
        compression_provider: "llm",
      }),
    ).toThrow("Unsupported prompt compression provider: llm");
  });
});
