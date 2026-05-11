#!/usr/bin/env tsx

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";

import {
  getLlama,
  LlamaChatSession,
  readGgufFileInfo,
  resolveChatWrapper,
} from "node-llama-cpp";

type BenchmarkMode = "direct" | "server" | "both";

type BenchmarkArgs = {
  modelPath: string;
  modelName: string;
  prompt: string;
  mode: BenchmarkMode;
  contextSize: number;
  maxTokens: number;
  temperature: number;
  gpuLayers: string;
  serverBinary: string;
  serverHost: string;
  serverPort: number;
  output?: string | undefined;
  verbose: boolean;
};

type BenchmarkRunResult =
  | {
      kind: "direct";
      supported: boolean;
      architecture?: string;
      chatWrapper?: string;
      loadMs?: number;
      promptMs?: number;
      modelSizeMb?: number;
      contextStateMb?: number;
      rssMb?: number;
      rssAfterPromptMb?: number;
      responsePreview?: string;
      error?: string;
    }
  | {
      kind: "server";
      supported: boolean;
      architecture?: string;
      startupMs?: number;
      promptMs?: number;
      rssMb?: number;
      responsePreview?: string;
      error?: string;
    };

type BenchmarkReport = {
  modelPath: string;
  modelName: string;
  prompt: string;
  mode: BenchmarkMode;
  contextSize: number;
  maxTokens: number;
  temperature: number;
  gpuLayers: string;
  nodeLlamaCppVersion: string;
  architecture?: string;
  direct?: Extract<BenchmarkRunResult, { kind: "direct" }>;
  server?: Extract<BenchmarkRunResult, { kind: "server" }>;
};

const require = createRequire(import.meta.url);

const DEFAULT_MODEL_PATH = process.env.DETOKS_BENCH_MODEL_PATH ?? "";
const DEFAULT_PROMPT = process.env.DETOKS_BENCH_PROMPT ?? "Reply with exactly one word: OK";
const DEFAULT_MODE = (process.env.DETOKS_BENCH_MODE ?? "both") as BenchmarkMode;
const DEFAULT_CONTEXT_SIZE = Number.parseInt(process.env.DETOKS_BENCH_CONTEXT_SIZE ?? "256", 10);
const DEFAULT_MAX_TOKENS = Number.parseInt(process.env.DETOKS_BENCH_MAX_TOKENS ?? "32", 10);
const DEFAULT_TEMPERATURE = Number.parseFloat(process.env.DETOKS_BENCH_TEMPERATURE ?? "0");
const DEFAULT_GPU_LAYERS = process.env.DETOKS_BENCH_GPU_LAYERS ?? "0";
const DEFAULT_SERVER_BINARY = process.env.DETOKS_BENCH_SERVER_BINARY ?? "llama-server";
const DEFAULT_SERVER_HOST = process.env.DETOKS_BENCH_SERVER_HOST ?? "127.0.0.1";
const DEFAULT_SERVER_PORT = Number.parseInt(process.env.DETOKS_BENCH_SERVER_PORT ?? "12370", 10);

function usage(): string {
  return [
    "Usage:",
    "  npm run benchmark:llm -- --model-path /path/to/model.gguf [options]",
    "",
    "Options:",
    "  --model-path <path>       GGUF model path to benchmark",
    "  --model-name <name>       Server-side model name/alias (default: file basename)",
    "  --prompt <text>           Prompt to run (default: a short OK prompt)",
    "  --mode direct|server|both Benchmark one side or both (default: both)",
    "  --context-size <n>        Context size for both runs (default: 256)",
    "  --max-tokens <n>          Max generated tokens (default: 32)",
    "  --temperature <n>         Sampling temperature (default: 0)",
    "  --gpu-layers <value>      GPU layers / offload mode (default: 0)",
    "  --server-binary <path>    llama-server binary (default: llama-server)",
    "  --server-host <host>      llama-server host (default: 127.0.0.1)",
    "  --server-port <port>      llama-server port (default: 12370)",
    "  --output <path>           Save JSON report to file",
    "  --verbose                 Print progress logs",
    "",
    "Env shortcuts:",
    "  DETOKS_BENCH_MODEL_PATH, DETOKS_BENCH_PROMPT, DETOKS_BENCH_MODE,",
    "  DETOKS_BENCH_CONTEXT_SIZE, DETOKS_BENCH_MAX_TOKENS, DETOKS_BENCH_TEMPERATURE,",
    "  DETOKS_BENCH_GPU_LAYERS, DETOKS_BENCH_SERVER_BINARY, DETOKS_BENCH_SERVER_HOST,",
    "  DETOKS_BENCH_SERVER_PORT",
  ].join("\n");
}

function parseArgs(argv: string[]): BenchmarkArgs {
  const parsed: Partial<BenchmarkArgs> = {
    modelPath: DEFAULT_MODEL_PATH,
    prompt: DEFAULT_PROMPT,
    mode: DEFAULT_MODE,
    contextSize: Number.isFinite(DEFAULT_CONTEXT_SIZE) ? DEFAULT_CONTEXT_SIZE : 256,
    maxTokens: Number.isFinite(DEFAULT_MAX_TOKENS) ? DEFAULT_MAX_TOKENS : 32,
    temperature: Number.isFinite(DEFAULT_TEMPERATURE) ? DEFAULT_TEMPERATURE : 0,
    gpuLayers: DEFAULT_GPU_LAYERS,
    serverBinary: DEFAULT_SERVER_BINARY,
    serverHost: DEFAULT_SERVER_HOST,
    serverPort: Number.isFinite(DEFAULT_SERVER_PORT) ? DEFAULT_SERVER_PORT : 12370,
    verbose: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if ((current === "--help" || current === "-h")) {
      console.log(usage());
      process.exit(0);
    }

    if (current === "--model-path" && next !== undefined) {
      parsed.modelPath = next;
      index += 1;
      continue;
    }
    if (current === "--model-name" && next !== undefined) {
      parsed.modelName = next;
      index += 1;
      continue;
    }
    if (current === "--prompt" && next !== undefined) {
      parsed.prompt = next;
      index += 1;
      continue;
    }
    if (current === "--mode" && next !== undefined) {
      parsed.mode = next as BenchmarkMode;
      index += 1;
      continue;
    }
    if (current === "--context-size" && next !== undefined) {
      parsed.contextSize = Number.parseInt(next, 10);
      index += 1;
      continue;
    }
    if (current === "--max-tokens" && next !== undefined) {
      parsed.maxTokens = Number.parseInt(next, 10);
      index += 1;
      continue;
    }
    if (current === "--temperature" && next !== undefined) {
      parsed.temperature = Number.parseFloat(next);
      index += 1;
      continue;
    }
    if (current === "--gpu-layers" && next !== undefined) {
      parsed.gpuLayers = next;
      index += 1;
      continue;
    }
    if (current === "--server-binary" && next !== undefined) {
      parsed.serverBinary = next;
      index += 1;
      continue;
    }
    if (current === "--server-host" && next !== undefined) {
      parsed.serverHost = next;
      index += 1;
      continue;
    }
    if (current === "--server-port" && next !== undefined) {
      parsed.serverPort = Number.parseInt(next, 10);
      index += 1;
      continue;
    }
    if (current === "--output" && next !== undefined) {
      parsed.output = next;
      index += 1;
      continue;
    }
    if (current === "--verbose") {
      parsed.verbose = true;
    }
  }

  if (!parsed.modelPath) {
    console.error(usage());
    throw new Error("--model-path is required");
  }

  if (!existsSync(parsed.modelPath)) {
    throw new Error(`Model file not found: ${parsed.modelPath}`);
  }

  if (!["direct", "server", "both"].includes(parsed.mode ?? "")) {
    throw new Error(`Invalid --mode value: ${String(parsed.mode)}`);
  }

  return {
    modelPath: parsed.modelPath,
    modelName: parsed.modelName ?? basename(parsed.modelPath, extname(parsed.modelPath)),
    prompt: parsed.prompt ?? DEFAULT_PROMPT,
    mode: parsed.mode ?? "both",
    contextSize: parsed.contextSize ?? 256,
    maxTokens: parsed.maxTokens ?? 32,
    temperature: parsed.temperature ?? 0,
    gpuLayers: parsed.gpuLayers ?? "0",
    serverBinary: parsed.serverBinary ?? "llama-server",
    serverHost: parsed.serverHost ?? "127.0.0.1",
    serverPort: parsed.serverPort ?? 12370,
    output: parsed.output,
    verbose: parsed.verbose ?? false,
  };
}

function toMb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 100) / 100;
}

function findCommandPath(command: string): string | null {
  const probe = spawnSync(process.platform === "win32" ? "where" : "which", [command], {
    encoding: "utf8",
  });
  if (probe.status !== 0 || typeof probe.stdout !== "string") {
    return null;
  }

  const resolved = probe.stdout.trim().split(/\r?\n/u)[0]?.trim();
  return resolved && resolved.length > 0 ? resolved : null;
}

function getProcessRssMb(pid: number): number | null {
  const result = spawnSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" });
  if (result.status !== 0) {
    return null;
  }

  const rssKb = Number.parseInt(result.stdout.trim(), 10);
  return Number.isFinite(rssKb) ? toMb(rssKb * 1024) : null;
}

function normalizeResponseContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (!item || typeof item !== "object") {
          return "";
        }

        if ("text" in item && typeof item.text === "string") {
          return item.text;
        }

        return "";
      })
      .join("");
  }

  return "";
}

async function waitForHealth(apiBase: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${apiBase.replace(/\/+$/u, "")}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Server did not become healthy within ${timeoutMs}ms: ${apiBase}`);
}

async function runDirectBenchmark(args: BenchmarkArgs): Promise<Extract<BenchmarkRunResult, { kind: "direct" }>> {
  const { metadata } = await readGgufFileInfo(args.modelPath, {
    readTensorInfo: false,
    logWarnings: false,
  });
  const architecture = metadata.general.architecture ?? "unknown";

  const llama = await getLlama();
  const loadStart = performance.now();
  try {
    const model = await llama.loadModel({
      modelPath: args.modelPath,
      gpuLayers: (() => {
        const lower = args.gpuLayers.toLowerCase();
        if (lower === "all") {
          return "max" as const;
        }
        if (lower === "auto" || lower === "max") {
          return lower as "auto" | "max";
        }
        const parsed = Number.parseInt(lower, 10);
        return Number.isFinite(parsed) ? parsed : ("auto" as const);
      })(),
    });
    const context = await model.createContext({
      contextSize: args.contextSize,
      performanceTracking: true,
    });
    const chatWrapper = resolveChatWrapper(model) ?? undefined;
    const session = new LlamaChatSession({
      contextSequence: context.getSequence(),
      chatWrapper,
    });

    const rssAfterLoad = toMb(process.memoryUsage().rss);
    const promptStart = performance.now();
    const response = await session.completePrompt(args.prompt, {
      maxTokens: args.maxTokens,
      temperature: args.temperature,
      trimWhitespaceSuffix: true,
    });
    const promptMs = performance.now() - promptStart;
    const rssAfterPrompt = toMb(process.memoryUsage().rss);
    const loadMs = Math.round(performance.now() - loadStart);
    const modelSizeMb = Math.round((model.size / 1024 / 1024) * 100) / 100;
    const contextStateMb = Math.round((context.stateSize / 1024 / 1024) * 100) / 100;

    await context.dispose();
    await model.dispose();
    await llama.dispose();

    return {
      kind: "direct",
      supported: true,
      architecture,
      chatWrapper: chatWrapper?.constructor?.name,
      loadMs,
      promptMs: Math.round(promptMs),
      modelSizeMb,
      contextStateMb,
      rssMb: rssAfterLoad,
      rssAfterPromptMb: rssAfterPrompt,
      responsePreview: response.slice(0, 160).replace(/\s+/gu, " ").trim(),
    };
  } catch (error) {
    await llama.dispose().catch(() => undefined);
    return {
      kind: "direct",
      supported: false,
      architecture,
      loadMs: Math.round(performance.now() - loadStart),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runServerBenchmark(args: BenchmarkArgs): Promise<Extract<BenchmarkRunResult, { kind: "server" }>> {
  const startedAt = performance.now();
  const apiBase = `http://${args.serverHost}:${args.serverPort}/v1`;
  const serverBinary = existsSync(args.serverBinary)
    ? args.serverBinary
    : findCommandPath(args.serverBinary) ?? args.serverBinary;
  const serverArgs = [
    "-m",
    args.modelPath,
    "--alias",
    args.modelName,
    "--host",
    args.serverHost,
    "--port",
    String(args.serverPort),
    "--ctx-size",
    String(args.contextSize),
    "--top-k",
    "40",
    "--top-p",
    "0.95",
    "--reasoning",
    "off",
    "--sleep-idle-seconds",
    "1200",
  ];

  if (args.gpuLayers) {
    serverArgs.push("--gpu-layers", args.gpuLayers);
  }

  const child = spawn(serverBinary, serverArgs, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  if (args.verbose) {
    child.stdout.on("data", (chunk) => process.stdout.write(String(chunk)));
    child.stderr.on("data", (chunk) => process.stderr.write(String(chunk)));
  }

  try {
    await waitForHealth(apiBase, 600_000);
    const startupMs = Math.round(performance.now() - startedAt);
    const rssMb = child.pid ? getProcessRssMb(child.pid) : null;
    const promptStart = performance.now();
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: args.modelName,
        messages: [{ role: "user", content: args.prompt }],
        temperature: args.temperature,
        max_tokens: args.maxTokens,
      }),
    });
    if (!response.ok) {
      throw new Error(`Server prompt failed: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = normalizeResponseContent(payload.choices?.[0]?.message?.content);

    return {
      kind: "server",
      supported: true,
      startupMs,
      promptMs: Math.round(performance.now() - promptStart),
      responsePreview: content.slice(0, 160).replace(/\s+/gu, " ").trim(),
      ...(rssMb !== null ? { rssMb } : {}),
    };
  } catch (error) {
    return {
      kind: "server",
      supported: false,
      startupMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (child.pid) {
      child.kill("SIGTERM");
      await Promise.race([
        new Promise<void>((resolve) => {
          child.once("close", () => resolve());
        }),
        new Promise<void>((resolve) => {
          setTimeout(() => {
            if (child.exitCode === null) {
              child.kill("SIGKILL");
            }
            resolve();
          }, 5_000).unref();
        }),
      ]);
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const nodeLlamaCppVersion = JSON.parse(
    await readFile(resolve(dirname(require.resolve("node-llama-cpp")), "..", "package.json"), "utf8"),
  ) as { version?: string };

  const report: BenchmarkReport = {
    modelPath: args.modelPath,
    modelName: args.modelName,
    prompt: args.prompt,
    mode: args.mode,
    contextSize: args.contextSize,
    maxTokens: args.maxTokens,
    temperature: args.temperature,
    gpuLayers: args.gpuLayers,
    nodeLlamaCppVersion: nodeLlamaCppVersion.version ?? "unknown",
  };

  if (args.verbose) {
    console.log(`Model: ${args.modelPath}`);
    console.log(`Mode: ${args.mode}`);
  }

  if (args.mode === "direct" || args.mode === "both") {
    report.direct = await runDirectBenchmark(args);
  }

  if (args.mode === "server" || args.mode === "both") {
    const serverBinaryPath = existsSync(args.serverBinary) ? args.serverBinary : findCommandPath(args.serverBinary);
    if (!serverBinaryPath) {
      report.server = {
        kind: "server",
        supported: false,
        error: `Server binary not found: ${args.serverBinary}`,
      };
    } else {
      report.server = await runServerBenchmark(args);
    }
  }

  const json = JSON.stringify(report, null, 2);
  if (args.output) {
    await writeFile(resolve(args.output), json, "utf8");
    console.log(`Saved benchmark to ${resolve(args.output)}`);
  } else {
    console.log(json);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
