import { describe, expect, it } from "vitest";
import { compress_prompt } from "../../../../../src/core/prompt/compression.js";

const defaultPolicies = {
  protectedTerms: [],
  preferredTranslations: {},
  forbiddenPatterns: [],
};

describe("compress_prompt", () => {
  it("저신호 요청 문구를 줄이되 핵심 동작은 유지한다", () => {
    const result = compress_prompt(
      "Can you please create a new endpoint for users and run the tests?",
      {
        policies: defaultPolicies,
      },
    );

    expect(result.compressed_prompt).toBe(
      "Create a new endpoint for users and run the tests?",
    );
    expect(result.repair_actions).toContain("compressed_with_nlp_adapter");
  });

  it("파일명, 경로, 명령어, 숫자 토큰은 보존한다", () => {
    const result = compress_prompt(
      "Please update src/api/user.ts, run npm test -- --runInBand 2 times, and keep REST API v2 unchanged.",
      {
        policies: defaultPolicies,
      },
    );

    expect(result.compressed_prompt).toContain("src/api/user.ts");
    expect(result.compressed_prompt).toContain("npm test -- --runInBand 2");
    expect(result.compressed_prompt).toContain("REST API v2");
  });

  it("압축이 비정상적으로 줄어들면 normalized_input으로 fallback 한다", () => {
    const result = compress_prompt("Can you please", {
      policies: defaultPolicies,
    });

    expect(result.compressed_prompt).toBe("Can you please");
    expect(result.repair_actions).toContain(
      "compression_fallback_to_normalized_input",
    );
  });
});
