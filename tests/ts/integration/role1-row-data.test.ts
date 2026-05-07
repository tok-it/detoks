import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  compilePrompt,
  createRole2PromptInput,
} from "../../../src/core/prompt/compiler.js";
import type { PromptCompileResponse } from "../../../src/schemas/pipeline.js";

interface RowDataFixture {
  data: string[];
}

function loadRowData(): string[] {
  const filePath = join(process.cwd(), "tests/data/row_data.json");
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as RowDataFixture;
  return parsed.data;
}

function pseudoTranslate(input: string): string {
  return input
    .replace(/[가-힣]/g, "x")
    .replace(/\s+/g, " ")
    .trim();
}

function createMockTranslationFetch() {
  return vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      messages?: Array<{ role: string; content: string }>;
    };
    const userMessage = body.messages?.find((message) => message.role === "user");
    const translated = pseudoTranslate(userMessage?.content ?? "");

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: translated,
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
}

const passthroughCompression = vi.fn(async (text: string) => ({
  compressed: text,
  compression_ratio: 1,
  tokens_saved: 0,
}));

describe("Role 1 row_data fixture", () => {
  it("row_data.json 전체를 Prompt Compiler 경계에 통과시킬 수 있다", async () => {
    const rows = loadRowData();
    const fetchImplementation = createMockTranslationFetch();

    const compiled = await Promise.all(
      rows.map((raw_input) =>
        compilePrompt(
          { raw_input },
          {
            env: {
              OPENAI_API_BASE: "http://127.0.0.1:1234/v1",
              OPENAI_API_KEY: "test-key",
              MODEL_NAME: "local-model",
              PIPELINE_MODE: "safe",
            },
            fetchImplementation,
            compressionImplementation: passthroughCompression,
          },
        ),
      ),
    );

    expect(compiled).toHaveLength(rows.length);
    compiled.forEach((item: PromptCompileResponse) => {
      const handoff = createRole2PromptInput(item);
      expect(item.compressed_prompt.length).toBeGreaterThan(0);
      expect(handoff.compiled_prompt).toBe(item.compressed_prompt);
      expect(item.language).toMatch(/^(ko|en|mixed)$/);
    });
  });

  it("debug mode에서는 row fixture에 대한 debug 경로를 재현할 수 있다", async () => {
    const [firstRow] = loadRowData();
    const fetchImplementation = createMockTranslationFetch();

    const compiled = await compilePrompt(
      { raw_input: firstRow! },
      {
        env: {
          OPENAI_API_BASE: "http://127.0.0.1:1234/v1",
          OPENAI_API_KEY: "test-key",
          MODEL_NAME: "local-model",
          PIPELINE_MODE: "debug",
        },
        fetchImplementation,
        compressionImplementation: passthroughCompression,
      },
    );

    expect(compiled.compressed_prompt.length).toBeGreaterThan(0);
    expect(fetchImplementation).toHaveBeenCalled();
  });
});
