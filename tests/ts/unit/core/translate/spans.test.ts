import { describe, expect, it } from "vitest";
import { mask_protected_segments } from "../../../../../src/core/translate/masking.js";
import {
  extract_translatable_spans,
  reassemble_spans,
} from "../../../../../src/core/translate/spans.js";

describe("extract_translatable_spans", () => {
  it("placeholder-only span과 code block span은 번역 대상에서 제외한다", () => {
    const sourceText = [
      "# Build Steps",
      "",
      "- `npm test`",
      "",
      "```ts",
      "const value = 1;",
      "```",
      "",
      "Update docs in src/core/prompt/compiler.ts",
      "| file | status |",
    ].join("\n");

    const masked = mask_protected_segments(sourceText);
    const spans = extract_translatable_spans(
      masked.masked_text,
      masked.placeholders,
    );

    expect(spans.map((span) => span.kind)).toEqual([
      "heading",
      "blank_line",
      "bullet",
      "blank_line",
      "code_block",
      "blank_line",
      "paragraph",
      "table_row",
    ]);
    expect(spans[2]!.translate).toBe(false);
    expect(spans[4]!.translate).toBe(false);
    expect(spans[6]!.translate).toBe(true);
  });

  it("span 재조립 시 Markdown 경계가 유지된다", () => {
    const maskedText = [
      "# Heading",
      "",
      "First paragraph line",
      "Second paragraph line",
      "",
      "1. __PH_0001__",
      "| A | B |",
    ].join("\n");

    const spans = extract_translatable_spans(maskedText);

    expect(reassemble_spans(spans)).toBe(maskedText);
  });
});
