import { describe, expect, it } from "vitest";
import { repair_translation } from "../../../../../src/core/guardrails/repair.js";

describe("repair_translation", () => {
  it("placeholder 순서를 구조적으로 복구한다", () => {
    const result = repair_translation({
      source_text: "__PH_0001__ 파일을 __PH_0002__에 생성해",
      compressed_prompt: "Create __PH_0002__ file in __PH_0001__",
      placeholders: ["__PH_0001__", "__PH_0002__"],
    });

    expect(result.output).toBe("Create __PH_0001__ file in __PH_0002__");
    expect(result.repair_actions).toContain("placeholder_order_restored");
  });

  it("forbidden pattern과 wrapper를 제거한다", () => {
    const result = repair_translation({
      source_text: "파일을 생성해",
      compressed_prompt: 'Translation: "Create a file"\n```',
      forbidden_patterns: ["```"],
    });

    expect(result.output).toBe("Create a file");
    expect(result.repair_actions).toContain("clean_translation_applied");
    expect(result.repair_actions).toContain("forbidden_pattern_removed:```");
  });
});
