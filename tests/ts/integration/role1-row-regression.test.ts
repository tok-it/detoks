import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  collect_preservable_literals,
  mask_protected_segments,
} from "../../../src/core/translate/masking.js";
import { translate_to_english } from "../../../src/core/translate/translate.js";

interface RowDataFixture {
  data: string[];
}

function loadRow(index: number): string {
  const filePath = join(process.cwd(), "tests/data/row_data.json");
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as RowDataFixture;
  const row = parsed.data[index];

  if (!row) {
    throw new Error(`missing row index: ${index}`);
  }

  return row;
}

describe("Role 1 row_data regression", () => {
  it("문제 사례의 핵심 기술 토큰을 보호 구간으로 수집한다", () => {
    const cases: Array<[index: number, tokens: string[]]> = [
      [71, ["concurrent.futures.ThreadPoolExecutor", "I/O"]],
      [76, ["matplotlib.pyplot.scatter", "2D"]],
      [85, ["numpy.dot(A, B)"]],
      [99, ["unittest.mock.patch"]],
      [102, ["sklearn.ensemble.RandomForestRegressor", "max_depth"]],
      [104, ["threading.Event", "'GO'"]],
    ];

    for (const [index, tokens] of cases) {
      const row = loadRow(index);
      const literals = collect_preservable_literals(row);
      const masked = mask_protected_segments(row);

      tokens.forEach((token) => {
        expect(literals).toContain(token);
        expect(masked.placeholders.some((entry) => entry.original === token)).toBe(true);
      });
    }
  });

  it("index 12는 복원 후 placeholder 불일치를 최종 validation에서 실패로 기록한다", async () => {
    const fetchImplementation = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "Review __PH_0001__ pipeline and __PH_0002__ rollout first",
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

    const result = await translate_to_english(loadRow(12), {
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

    expect(result.validation_errors).toContain("placeholder_count_mismatch");
  });
});
