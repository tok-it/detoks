import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Role1RuntimeConfig } from "../prompt/config.js";
import { logger } from "../utils/logger.js";

let startupPromise: Promise<void> | null = null;

function isLocalHost(hostname: string): boolean {
  return ["127.0.0.1", "localhost", "::1"].includes(hostname);
}

function healthUrlFromApiBase(apiBase: string): string {
  const url = new URL(apiBase);
  return `${url.origin}/health`;
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`;
}

async function isServerReady(apiBase: string): Promise<boolean> {
  try {
    const response = await fetch(healthUrlFromApiBase(apiBase));
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServerReady(
  apiBase: string,
  timeoutMs: number,
): Promise<void> {
  const startedAt = Date.now();
  let nextLogAt = startedAt + 10_000;

  while (Date.now() - startedAt < timeoutMs) {
    if (await isServerReady(apiBase)) {
      logger.warn(`llama.cpp server is ready at ${apiBase}`);
      return;
    }

    const now = Date.now();
    if (now >= nextLogAt) {
      logger.warn(`Waiting for llama.cpp server startup at ${apiBase}...`);
      nextLogAt = now + 10_000;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`llama.cpp server did not become ready within ${timeoutMs}ms`);
}

async function downloadModel(modelUrl: string, modelPath: string): Promise<void> {
  mkdirSync(dirname(modelPath), { recursive: true });

  const response = await fetch(modelUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download GGUF model: ${response.status} ${response.statusText}`);
  }

  const totalBytes = Number(response.headers.get("content-length") ?? 0);
  let downloadedBytes = 0;
  let nextLogAt = Date.now();
  logger.warn(
    `Downloading GGUF model to ${modelPath}${totalBytes > 0 ? ` (${formatBytes(totalBytes)})` : ""}...`,
  );

  const progressStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      downloadedBytes += chunk.byteLength;
      const now = Date.now();

      if (now >= nextLogAt) {
        const totalText = totalBytes > 0 ? ` / ${formatBytes(totalBytes)}` : "";
        logger.warn(`Downloading GGUF model: ${formatBytes(downloadedBytes)}${totalText}`);
        nextLogAt = now + 5_000;
      }

      controller.enqueue(chunk);
    },
  });

  await pipeline(
    Readable.fromWeb(response.body.pipeThrough(progressStream)),
    createWriteStream(modelPath, { flags: "wx" }),
  );
  logger.warn(`Downloaded GGUF model to ${modelPath}`);
}

async function ensureModelFile(config: Role1RuntimeConfig): Promise<void> {
  if (!config.localLlmModelPath || existsSync(config.localLlmModelPath)) {
    return;
  }

  if (!config.localLlmModelUrl) {
    throw new Error(
      `GGUF model file not found: ${config.localLlmModelPath}. Set LOCAL_LLM_MODEL_URL or LOCAL_LLM_HF_REPO.`,
    );
  }

  await downloadModel(config.localLlmModelUrl, config.localLlmModelPath);
}

export function buildLlamaServerArgs(config: Role1RuntimeConfig): string[] {
  const args: string[] = [];

  if (config.localLlmModelPath) {
    args.push("-m", config.localLlmModelPath);
  } else {
    const hfRepo = config.localLlmHfRepo ?? config.localLlmModelName;
    if (!hfRepo) {
      throw new Error("Role 1 local LLM requires LOCAL_LLM_MODEL_PATH or LOCAL_LLM_HF_REPO");
    }

    args.push("-hf", hfRepo);
    if (config.localLlmHfFile) {
      args.push("--hf-file", config.localLlmHfFile);
    }
  }

  if (config.localLlmModelName) {
    args.push("--alias", config.localLlmModelName);
  }

  args.push(
    "--host",
    config.localLlmServerHost ?? "127.0.0.1",
    "--port",
    String(config.localLlmServerPort ?? 12370),
  );

  if (config.localLlmGpuLayers) {
    args.push("--gpu-layers", config.localLlmGpuLayers);
  }

  if (config.localLlmDevice) {
    args.push("--device", config.localLlmDevice);
  }

  if (config.localLlmContextSize) {
    args.push("--ctx-size", String(config.localLlmContextSize));
  }

  if (config.localLlmReasoning) {
    args.push("--reasoning", config.localLlmReasoning);
  }

  return args;
}

async function startServerProcess(
  config: Role1RuntimeConfig,
  apiBase: string,
): Promise<void> {
  const binary = config.localLlmServerBinary ?? "llama-server";
  const args = buildLlamaServerArgs(config);
  logger.warn(`Starting llama.cpp server: ${binary} ${args.join(" ")}`);
  const child = spawn(binary, args, {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    String(chunk)
      .trimEnd()
      .split(/\r?\n/u)
      .filter(Boolean)
      .forEach((line) => logger.warn(`[llama-server] ${line}`));
  });
  child.stderr.on("data", (chunk) => {
    String(chunk)
      .trimEnd()
      .split(/\r?\n/u)
      .filter(Boolean)
      .forEach((line) => logger.warn(`[llama-server] ${line}`));
  });
  child.unref();

  await Promise.race([
    waitForServerReady(apiBase, config.localLlmStartupTimeout ?? 600_000),
    new Promise<never>((_, reject) => {
      child.once("error", (error) => {
        reject(new Error(`Failed to start llama.cpp server with ${binary}: ${error.message}`));
      });
      child.once("exit", (code) => {
        reject(new Error(`llama.cpp server exited before becoming ready: ${code ?? "unknown"}`));
      });
    }),
  ]);
}

function shouldRetryWithoutGpu(config: Role1RuntimeConfig): boolean {
  return config.localLlmDevice !== "none" || config.localLlmGpuLayers !== "0";
}

async function startLocalServer(config: Role1RuntimeConfig): Promise<void> {
  const apiBase = config.localLlmApiBase;
  if (!apiBase) {
    throw new Error("LLM client requires LOCAL_LLM_API_BASE");
  }

  const apiBaseUrl = new URL(apiBase);
  if (!isLocalHost(apiBaseUrl.hostname)) {
    return;
  }

  if (await isServerReady(apiBase)) {
    return;
  }

  await ensureModelFile(config);

  try {
    await startServerProcess(config, apiBase);
  } catch (error) {
    if (!shouldRetryWithoutGpu(config)) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`llama.cpp GPU startup failed, retrying with CPU only: ${message}`);
    await startServerProcess(
      {
        ...config,
        localLlmDevice: "none",
        localLlmGpuLayers: "0",
      },
      apiBase,
    );
  }
}

export async function ensureLocalLlmRuntime(config: Role1RuntimeConfig): Promise<void> {
  if (config.localLlmAutoStart === false) {
    return;
  }

  startupPromise ??= startLocalServer(config).catch((error) => {
    startupPromise = null;
    throw error;
  });

  await startupPromise;
}
