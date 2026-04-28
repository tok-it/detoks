import { describe, expect, it } from "vitest";
import {
  collect_preservable_literals,
  mask_protected_segments,
  restore_placeholders,
} from "../../../../../src/core/translate/masking.js";

describe("mask_protected_segments", () => {
  it("보호 대상 마스킹 후 restore 시 원문이 그대로 복원된다", () => {
    const sourceText = [
      "Use REST API with GPT-4.1 in src/core/prompt/compiler.ts.",
      'Send to test@example.com and fetch https://example.com/docs.',
      'JSON sample: {"userId": 123, "API": "v1"}',
      "Run `npm test` before deploy.",
      "```ts",
      'const path = "src/core/prompt/compiler.ts";',
      "```",
    ].join("\n");

    const masked = mask_protected_segments(sourceText, {
      protected_terms: ["REST API"],
      preferred_translations: {
        deploy: "deploy",
      },
    });

    expect(masked.placeholders.length).toBeGreaterThanOrEqual(8);
    expect(masked.placeholders[0]!.placeholder).toBe("__PH_0001__");
    expect(masked.placeholders.at(-1)!.placeholder).toMatch(/^__PH_\d{4}__$/);
    expect(masked.masked_text).not.toContain("REST API");
    expect(masked.masked_text).not.toContain("https://example.com/docs");
    expect(masked.masked_text).not.toContain("test@example.com");
    expect(restore_placeholders(masked.masked_text, masked.placeholders)).toBe(
      sourceText,
    );
  });

  it("compound protected term은 longest-to-shortest로 단일 placeholder 처리한다", () => {
    const sourceText = "Use REST API and API together.";
    const masked = mask_protected_segments(sourceText, {
      protected_terms: ["API", "REST API"],
    });

    expect(masked.placeholders).toHaveLength(2);
    expect(masked.placeholders[0]!.original).toBe("REST API");
    expect(masked.placeholders[1]!.original).toBe("API");
    expect(masked.masked_text).toBe("Use __PH_0001__ and __PH_0002__ together.");
    expect(restore_placeholders(masked.masked_text, masked.placeholders)).toBe(
      sourceText,
    );
  });

  it("qualified identifier, 함수 호출식, slash token, quoted literal을 보호한다", () => {
    const sourceText = [
      "Use unittest.mock.patch on external API calls.",
      "Run numpy.dot(A, B) before visualization.",
      "Keep I/O and blue/green deployment terms unchanged.",
      "Wait for 'GO' after threading.Event is set.",
    ].join(" ");

    const masked = mask_protected_segments(sourceText);
    const literals = collect_preservable_literals(sourceText);

    expect(literals).toContain("unittest.mock.patch");
    expect(literals).toContain("numpy.dot(A, B)");
    expect(literals).toContain("I/O");
    expect(literals).toContain("blue/green");
    expect(literals).toContain("'GO'");
    expect(literals).toContain("threading.Event");
    expect(restore_placeholders(masked.masked_text, masked.placeholders)).toBe(
      sourceText,
    );
  });

  it("일반 한국어 인용구는 보호하지 않는다", () => {
    const sourceText = "사용자에게 '확인 버튼을 눌러 주세요'라고 안내해";
    const masked = mask_protected_segments(sourceText);
    const literals = collect_preservable_literals(sourceText);

    expect(masked.placeholders).toHaveLength(0);
    expect(literals).toEqual([]);
    expect(masked.masked_text).toBe(sourceText);
  });

  it("한글이 섞인 slash token과 괄호형 혼합 표현은 과보호하지 않는다", () => {
    const sourceText = "배포 전략으로 블루/그린이나 ROI(투자 대비 효과)를 검토해";
    const masked = mask_protected_segments(sourceText);
    const literals = collect_preservable_literals(sourceText);

    expect(masked.masked_text).toContain("블루/그린");
    expect(masked.masked_text).toContain("__PH_0001__(투자 대비 효과)");
    expect(masked.masked_text).toContain("투자 대비 효과");
    expect(literals).toContain("ROI");
    expect(literals).not.toContain("블루/그린");
    expect(literals).not.toContain("ROI(투자 대비 효과)");
  });
});
