import { describe, expect, it, vi } from "vitest";
import { compress_prompt } from "../../../../../src/core/prompt/compression.js";

const defaultPolicies = {
  protectedTerms: [],
  preferredTranslations: {},
  forbiddenPatterns: [],
};

describe("compress_prompt", () => {
  it("Kompress 결과를 사용하되 핵심 동작은 유지한다", async () => {
    const result = await compress_prompt(
      "Can you please create a new endpoint for users and run the tests?",
      {
        policies: defaultPolicies,
        config: {
          kompressPythonBin: "python3",
          kompressModelId: "chopratejas/kompress-base",
          kompressStartupTimeout: 120000,
          requestTimeout: 30000,
        },
        compressionImplementation: vi.fn(async (text: string) => ({
          compressed: text
            .replace(/^Can you please /i, "")
            .replace(
              /a new endpoint for users and run the tests\?/i,
              "new endpoint users run tests?",
            ),
          compression_ratio: 0.57,
          tokens_saved: 3,
        })),
      },
    );

    expect(result.compressed_prompt).toBe(
      "Create new endpoint users run tests?",
    );
    expect(result.repair_actions).toContain("compressed_with_kompress");
  });

  it("파일명, 경로, 명령어, 숫자 토큰은 보존한다", async () => {
    const compressionImplementation = vi.fn(async (text: string) => ({
      compressed: text
        .replace(/^Please /i, "")
        .replace(", and keep ", ", keep "),
      compression_ratio: 0.63,
      tokens_saved: 4,
    }));
    const result = await compress_prompt(
      "Please update src/api/user.ts, run npm test -- --runInBand 2 times, and keep REST API v2 unchanged.",
      {
        policies: defaultPolicies,
        config: {
          kompressPythonBin: "python3",
          kompressModelId: "chopratejas/kompress-base",
          kompressStartupTimeout: 120000,
          requestTimeout: 30000,
        },
        compressionImplementation,
      },
    );

    expect(result.compressed_prompt).toContain("src/api/user.ts");
    expect(result.compressed_prompt).toContain("npm test -- --runInBand 2");
    expect(result.compressed_prompt).toContain("REST API v2");
    for (const [text] of compressionImplementation.mock.calls) {
      expect(text).not.toContain("__PH_");
    }
  });

  it("짧은 입력은 모델 호출 없이 안전하게 fallback 한다", async () => {
    const compressionImplementation = vi.fn();
    const result = await compress_prompt("Can you please", {
      policies: defaultPolicies,
      config: {
        kompressPythonBin: "python3",
        kompressModelId: "chopratejas/kompress-base",
        kompressStartupTimeout: 120000,
        requestTimeout: 30000,
      },
      compressionImplementation,
    });

    expect(result.compressed_prompt).toBe("Can you please");
    expect(result.repair_actions).toContain(
      "compression_fallback_to_normalized_input",
    );
    expect(compressionImplementation).not.toHaveBeenCalled();
  });

  it("기술 식별자가 포함된 문장은 압축 후에도 핵심 토큰을 유지한다", async () => {
    const result = await compress_prompt(
      "Please run numpy.dot(A, B) first and then replace the external call with unittest.mock.patch.",
      {
        policies: defaultPolicies,
        config: {
          kompressPythonBin: "python3",
          kompressModelId: "chopratejas/kompress-base",
          kompressStartupTimeout: 120000,
          requestTimeout: 30000,
        },
        compressionImplementation: vi.fn(async (text: string) => ({
          compressed: text
            .replace(/^Please /i, "")
            .replace(" and then ", " ")
            .replace("with ", ""),
          compression_ratio: 0.58,
          tokens_saved: 4,
        })),
      },
    );

    expect(result.compressed_prompt).toContain("numpy.dot(A, B)");
    expect(result.compressed_prompt).toContain("unittest.mock.patch");
  });

  it("placeholder가 포함되어도 Kompress에는 자연어 segment만 전달한다", async () => {
    const compressionImplementation = vi.fn(async (text: string) => ({
      compressed: text.replace(
        /then describe in detail how the deployment team should verify the risky changes before shipping this release\./i,
        "then describe release verification for risky changes.",
      ),
      compression_ratio: 0.51,
      tokens_saved: 8,
    }));

    const result = await compress_prompt(
      "Please update src/api/user.ts and run npm test -- --runInBand 2 times, then describe in detail how the deployment team should verify the risky changes before shipping this release.",
      {
        policies: defaultPolicies,
        config: {
          kompressPythonBin: "python3",
          kompressModelId: "chopratejas/kompress-base",
          kompressStartupTimeout: 120000,
          requestTimeout: 30000,
        },
        compressionImplementation,
      },
    );

    expect(compressionImplementation).toHaveBeenCalled();
    for (const [text] of compressionImplementation.mock.calls) {
      expect(text).not.toContain("__PH_");
    }
    expect(result.compressed_prompt).toContain("src/api/user.ts");
    expect(result.compressed_prompt).toContain("npm test -- --runInBand 2");
    expect(result.compressed_prompt).toContain("release verification for risky changes");
  });
});
