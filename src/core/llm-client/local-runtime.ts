import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Role1RuntimeConfig } from "../prompt/config.js";

let startupPromise: Promise<void> | null = null;

function isLocalHost(hostname: string): boolean {
  return ["127.0.0.1", "localhost", "::1"].includes(hostname);
}

function healthUrlFromApiBase(apiBase: string): string {
  const url = new URL(apiBase);
  return `${url.origin}/health`;
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

  while (Date.now() - startedAt < timeoutMs) {
    if (await isServerReady(apiBase)) {
      return;
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

  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(modelPath, { flags: "wx" }),
  );
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

  return args;
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

  const binary = config.localLlmServerBinary ?? "llama-server";
  const child = spawn(binary, buildLlamaServerArgs(config), {
    detached: true,
    stdio: "ignore",
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
