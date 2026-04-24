import { describe, expect, it } from "vitest";
import { validate_translation } from "../../../../../src/core/guardrails/validator.js";

describe("validate_translation", () => {
  it("placeholder count/order mismatch를 검출한다", () => {
    const result = validate_translation({
      source_text: "__PH_0001__ 파일을 생성해 __PH_0002__",
      compressed_prompt: "Create __PH_0002__ file",
      placeholders: ["__PH_0001__", "__PH_0002__"],
    });

    expect(result.validation_errors).toContain("placeholder_count_mismatch");
  });

  it("한글 잔존과 forbidden pattern을 검출한다", () => {
    const result = validate_translation({
      source_text: "파일을 생성해",
      compressed_prompt: "Translation: 파일을 생성해",
      forbidden_patterns: ["^Translation:"],
    });

    expect(result.validation_errors).toContain("korean_text_remaining");
    expect(result.validation_errors).toContain("source_korean_copied");
    expect(result.validation_errors).toContain("forbidden_pattern:^Translation:");
  });
});
