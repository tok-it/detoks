import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadInputs, parseArgs } from "../../../../scripts/verify-role1.js";

interface RowDataFixture {
  data: string[];
}

interface JsonlPromptRow {
  prompt: string;
}

function loadJsonlPrompts(): string[] {
  const filePath = join(process.cwd(), "tests/data/data_ko.jsonl");
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => (JSON.parse(line) as JsonlPromptRow).prompt);
}

describe("verify-role1 input loading", () => {
  it("npm config와 bare path 인자를 함께 받아도 file/output으로 해석한다", () => {
    const parsed = parseArgs(
      ["tests/data/data_ko.jsonl", "tmp/role1-ko-result.json"],
      {
        npm_config_file: "tests/data/data_ko.jsonl",
        npm_config_output: "tmp/role1-ko-result.json",
      },
    );

    expect(parsed).toMatchObject({
      filePath: "tests/data/data_ko.jsonl",
      outputPath: "tmp/role1-ko-result.json",
      debug: false,
    });
  });

  it("JSONL 파일의 prompt 필드를 입력으로 읽는다", () => {
    const expected = loadJsonlPrompts();
    const rows = loadInputs({
      filePath: "tests/data/data_ko.jsonl",
      debug: false,
      index: 1,
    });

    expect(rows).toEqual([expected[1]]);
  });

  it("기존 JSON 배열 입력도 그대로 읽는다", () => {
    const filePath = join(process.cwd(), "tests/data/row_data.json");
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as RowDataFixture;

    const rows = loadInputs({
      filePath: "tests/data/row_data.json",
      debug: false,
      limit: 2,
    });

    expect(rows).toEqual(parsed.data.slice(0, 2));
  });
});
