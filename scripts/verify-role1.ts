#!/usr/bin/env tsx

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { compilePrompt, createRole2PromptInput } from "../src/core/prompt/compiler.js";
import { loadRole1RuntimeConfig } from "../src/core/prompt/config.js";

interface VerifyOptions {
  prompt?: string;
  filePath: string;
  limit?: number;
  index?: number;
  outputPath?: string;
  debug: boolean;
}

interface BatchInput {
  data: string[];
}

interface VerificationItem {
  index: number;
  raw_input: string;
  compiled_prompt: string;
  role2_handoff: string;
  language: "ko" | "en" | "mixed";
  validation_errors: string[];
  repair_actions: string[];
}

function getUsage(): string {
  return [
    "Usage:",
    "  npm run verify:role1 -- --prompt \"새 파일을 생성해\"",
    "  npm run verify:role1 -- --file tests/data/row_data.json --limit 5",
    "  npm run verify:role1 -- --file tests/data/row_data.json --index 12 --debug --output tmp/role1-result.json",
    "",
    "Options:",
    "  --prompt <text>    단일 프롬프트 수동 검증",
    "  --file <path>      입력 JSON 파일 경로 (기본: tests/data/row_data.json)",
    "  --limit <n>        앞에서부터 n개만 실행",
    "  --index <n>        0-based 특정 인덱스 1개만 실행",
    "  --output <path>    결과 JSON 저장 경로",
    "  --debug            PIPELINE_MODE=debug로 실행",
    "  --help             도움말 출력",
  ].join("\n");
}

function parseArgs(argv: string[]): VerifyOptions {
  let prompt: string | undefined;
  let filePath = "tests/data/row_data.json";
  let limit: number | undefined;
  let index: number | undefined;
  let outputPath: string | undefined;
  let debug = false;

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current) {
      continue;
    }

    if (current === "--help" || current === "-h") {
      console.log(getUsage());
      process.exit(0);
    }

    if (current === "--debug") {
      debug = true;
      continue;
    }

    if (current === "--prompt") {
      prompt = argv[i + 1];
      i += 1;
      continue;
    }

    if (current === "--file") {
      filePath = argv[i + 1] ?? filePath;
      i += 1;
      continue;
    }

    if (current === "--limit") {
      limit = Number(argv[i + 1]);
      i += 1;
      continue;
    }

    if (current === "--index") {
      index = Number(argv[i + 1]);
      i += 1;
      continue;
    }

    if (current === "--output") {
      outputPath = argv[i + 1];
      i += 1;
      continue;
    }

    if (!current.startsWith("--") && !prompt) {
      prompt = current;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error("--limit must be a positive integer");
  }

  if (index !== undefined && (!Number.isInteger(index) || index < 0)) {
    throw new Error("--index must be a non-negative integer");
  }

  return {
    prompt,
    filePath,
    limit,
    index,
    outputPath,
    debug,
  };
}

function loadInputs(options: VerifyOptions): string[] {
  if (options.prompt) {
    return [options.prompt];
  }

  const absolutePath = resolve(process.cwd(), options.filePath);
  const parsed = JSON.parse(readFileSync(absolutePath, "utf8")) as BatchInput;

  if (!Array.isArray(parsed.data)) {
    throw new Error(`Invalid input file shape: ${absolutePath}`);
  }

  let rows = parsed.data;

  if (options.index !== undefined) {
    const item = rows[options.index];
    if (item === undefined) {
      throw new Error(`Index out of range: ${options.index}`);
    }
    rows = [item];
  } else if (options.limit !== undefined) {
    rows = rows.slice(0, options.limit);
  }

  return rows;
}

function maskApiKey(value: string | undefined): string {
  if (!value) {
    return "(not set)";
  }

  if (value.length <= 6) {
    return "***";
  }

  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const runtimeConfig = loadRole1RuntimeConfig({
    env: {
      ...process.env,
      ...(options.debug ? { PIPELINE_MODE: "debug" } : {}),
    },
  });
  const inputs = loadInputs(options);

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "role1-verify",
        model: runtimeConfig.modelName ?? "(not set)",
        api_base: runtimeConfig.openaiApiBase ?? "(not set)",
        api_key: maskApiKey(runtimeConfig.openaiApiKey),
        pipeline_mode: options.debug ? "debug" : runtimeConfig.pipelineMode,
        input_count: inputs.length,
      },
      null,
      2,
    ),
  );

  const results: VerificationItem[] = [];

  for (const [index, raw_input] of inputs.entries()) {
    const compiled = await compilePrompt(
      { raw_input },
      {
        env: {
          ...process.env,
          ...(options.debug ? { PIPELINE_MODE: "debug" } : {}),
        },
      },
    );
    const handoff = createRole2PromptInput(compiled);

    const item: VerificationItem = {
      index: options.index !== undefined ? options.index : index,
      raw_input,
      compiled_prompt: compiled.compressed_prompt,
      role2_handoff: handoff.compiled_prompt,
      language: compiled.language,
      validation_errors: compiled.validation_errors ?? [],
      repair_actions: compiled.repair_actions ?? [],
    };

    results.push(item);

    console.log(
      JSON.stringify(
        {
          index: item.index,
          language: item.language,
          raw_input: item.raw_input,
          compiled_prompt: item.compiled_prompt,
          validation_errors: item.validation_errors,
          repair_actions: item.repair_actions,
        },
        null,
        2,
      ),
    );
  }

  if (options.outputPath) {
    const absoluteOutputPath = isAbsolute(options.outputPath)
      ? options.outputPath
      : join(process.cwd(), options.outputPath);
    mkdirSync(dirname(absoluteOutputPath), { recursive: true });
    writeFileSync(
      absoluteOutputPath,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          pipeline_mode: options.debug ? "debug" : runtimeConfig.pipelineMode,
          input_count: results.length,
          results,
        },
        null,
        2,
      ),
      "utf8",
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          output: absoluteOutputPath,
        },
        null,
        2,
      ),
    );
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exitCode = 1;
});
