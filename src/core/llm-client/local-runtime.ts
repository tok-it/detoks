import { spawn, spawnSync } from "node:child_process";
import { accessSync, closeSync, constants, createWriteStream, existsSync, mkdirSync, openSync, readSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Role1RuntimeConfig } from "../prompt/config.js";
import { logger } from "../utils/logger.js";

let startupPromise: Promise<void> | null = null;
let startupSignature: string | null = null;
let activeServerPid: number | null = null;
let lastUsedPort: number | undefined = undefined;
let lastUsedModel: string | undefined = undefined;

function isLocalHost(hostname: string): boolean {
  return ["127.0.0.1", "localhost", "::1"].includes(hostname);
}

function healthUrlFromApiBase(apiBase: string): string {
  const url = new URL(apiBase);
  return `${url.origin}/health`;
}

function modelsUrlFromApiBase(apiBase: string): string {
  return new URL(
    "models",
    apiBase.endsWith("/") ? apiBase : `${apiBase}/`,
  ).toString();
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

async function fetchLoadedModelIds(apiBase: string): Promise<string[]> {
  try {
    const response = await fetch(modelsUrlFromApiBase(apiBase));
    if (!response.ok || typeof response.json !== "function") {
      return [];
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const modelIds = new Set<string>();

    if (Array.isArray(payload.data)) {
      for (const item of payload.data) {
        if (!item || typeof item !== "object") {
          continue;
        }

        if ("id" in item && typeof item.id === "string") {
          modelIds.add(item.id);
        }

        if ("aliases" in item && Array.isArray(item.aliases)) {
          item.aliases
            .filter((alias: unknown): alias is string => typeof alias === "string")
            .forEach((alias: string) => modelIds.add(alias));
        }
      }
    }

    if (Array.isArray(payload.models)) {
      for (const item of payload.models) {
        if (!item || typeof item !== "object") {
          continue;
        }

        if ("name" in item && typeof item.name === "string") {
          modelIds.add(item.name);
        }

        if ("model" in item && typeof item.model === "string") {
          modelIds.add(item.model);
        }
      }
    }

    return [...modelIds];
  } catch {
    return [];
  }
}

function buildStartupSignature(config: Role1RuntimeConfig): string {
  return JSON.stringify({
    binary: config.localLlmServerBinary ?? "llama-server",
    args: buildLlamaServerArgs(config),
    apiBase: config.localLlmApiBase ?? "",
  });
}

async function assertExpectedServerModel(
  apiBase: string,
  expectedModelName: string | undefined,
): Promise<void> {
  if (!expectedModelName) {
    return;
  }

  const loadedModelIds = await fetchLoadedModelIds(apiBase);
  if (loadedModelIds.length === 0 || loadedModelIds.includes(expectedModelName)) {
    return;
  }

  throw new Error(
    `llama.cpp server at ${apiBase} is already running with model(s): ${loadedModelIds.join(", ")}. Expected ${expectedModelName}. Update LOCAL_LLM_MODEL_NAME or LOCAL_LLM_SERVER_PORT in .env to match the running server, or stop the running server before retrying.`,
  );
}

async function listLlamaServerProcesses(): Promise<Array<{ pid: number; command: string }>> {
  return await new Promise((resolve) => {
    const child = spawn("pgrep", ["-af", "llama-server"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.once("error", () => {
      resolve([]);
    });

    child.once("close", (code) => {
      if (code !== 0 && stdout.trim().length === 0) {
        resolve([]);
        return;
      }

      const processes = stdout
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const spaceIndex = line.indexOf(" ");
          if (spaceIndex <= 0) {
            return null;
          }

          const pid = Number.parseInt(line.slice(0, spaceIndex), 10);
          if (!Number.isFinite(pid)) {
            return null;
          }

          return {
            pid,
            command: line.slice(spaceIndex + 1).trim(),
          };
        })
        .filter(
          (
            processInfo,
          ): processInfo is { pid: number; command: string } => processInfo !== null,
        );

      resolve(processes);
    });
  });
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function commandMatchesPort(command: string, port: number): boolean {
  return (
    command.includes("llama-server") &&
    (command.includes(`--port ${port}`) || command.includes(`--port=${port}`))
  );
}

function isExecutablePath(binary: string): boolean {
  try {
    accessSync(binary, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function getBinaryProbeCommand(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? "where" : "which";
}

function isLlamaServerBinaryAvailable(binary: string): boolean {
  if (binary.includes("/") || binary.includes("\\")) {
    return isExecutablePath(binary);
  }

  const probe = spawnSync(getBinaryProbeCommand(), [binary], { stdio: "ignore" });
  return !probe.error && probe.status === 0;
}

async function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isProcessAlive(pid)) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return false;
}

async function stopExistingServerProcess(port: number): Promise<void> {
  const processes = (await listLlamaServerProcesses()).filter(({ command }) =>
    commandMatchesPort(command, port),
  );
  const pids = new Set<number>(
    processes.map(({ pid }) => pid).concat(activeServerPid ? [activeServerPid] : []),
  );

  if (pids.size === 0) {
    return;
  }

  logger.warn(`Stopping existing llama.cpp server on port ${port} before reloading`);

  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // 이미 종료됐거나 권한이 없으면 무시하고 다음 단계로 진행한다.
    }
  }

  const pidsArray = [...pids];
  const terminated = await Promise.all(
    pidsArray.map((pid) => waitForProcessExit(pid, 5_000)),
  );

  if (terminated.every(Boolean)) {
    activeServerPid = null;
    return;
  }

  for (const pid of pidsArray.filter((_, index) => !terminated[index])) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // 강제 종료가 불가능하면 아래 readiness 확인에서 걸러진다.
    }
  }

  const killed = await Promise.all(
    pidsArray.map((pid) => waitForProcessExit(pid, 5_000)),
  );
  if (!killed.every(Boolean)) {
    throw new Error(`Failed to stop existing llama.cpp server on port ${port}`);
  }

  activeServerPid = null;
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
  if (!config.localLlmModelPath) {
    return;
  }

  if (existsSync(config.localLlmModelPath)) {
    const stats = statSync(config.localLlmModelPath);
    if (!stats.isFile()) {
      throw new Error(
        `로컬 GGUF 모델 파일이 유효하지 않습니다: ${config.localLlmModelPath} (일반 파일이 아닙니다). detoks는 이 파일을 자동 삭제/재다운로드하지 않습니다. .env의 LOCAL_LLM_MODEL_PATH / LOCAL_LLM_HF_FILE을 올바른 GGUF 파일로 맞추거나 파일을 수동으로 교체하세요.`,
      );
    }

    if (stats.size === 0) {
      throw new Error(
        `로컬 GGUF 모델 파일이 비어 있습니다: ${config.localLlmModelPath} (0바이트). detoks는 이 파일을 자동 삭제/재다운로드하지 않습니다. .env의 LOCAL_LLM_MODEL_PATH / LOCAL_LLM_HF_FILE을 올바른 GGUF 파일로 맞추거나 파일을 수동으로 교체하세요.`,
      );
    }

    if (stats.size < 4) {
      throw new Error(
        `로컬 GGUF 모델 파일이 너무 작습니다: ${config.localLlmModelPath} (${stats.size}바이트). detoks는 이 파일을 자동 삭제/재다운로드하지 않습니다. .env의 LOCAL_LLM_MODEL_PATH / LOCAL_LLM_HF_FILE을 올바른 GGUF 파일로 맞추거나 파일을 수동으로 교체하세요.`,
      );
    }

    if (stats.size >= 4) {
      const fd = openSync(config.localLlmModelPath, "r");
      try {
        const header = Buffer.alloc(4);
        const bytesRead = readSync(fd, header, 0, 4, 0);
        if (bytesRead < 4 || header.toString("utf8", 0, 4) !== "GGUF") {
          throw new Error(
            `로컬 GGUF 모델 파일 헤더가 올바르지 않습니다: ${config.localLlmModelPath}. detoks는 이 파일을 자동 삭제/재다운로드하지 않습니다. .env의 LOCAL_LLM_MODEL_PATH / LOCAL_LLM_HF_FILE을 올바른 GGUF 파일로 맞추거나 파일을 수동으로 교체하세요.`,
          );
        }
      } finally {
        closeSync(fd);
      }
    }

    return;
  }

  if (!config.localLlmModelUrl) {
    throw new Error(
      `GGUF 모델 파일을 찾을 수 없습니다: ${config.localLlmModelPath}. .env의 LOCAL_LLM_MODEL_PATH가 존재하는지 확인하거나 LOCAL_LLM_MODEL_URL / LOCAL_LLM_HF_REPO를 설정하세요.`,
    );
  }

  await downloadModel(config.localLlmModelUrl, config.localLlmModelPath);
  await ensureModelFile(config);
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

  if (config.localLlmTopK !== undefined) {
    args.push("--top-k", String(config.localLlmTopK));
  }

  if (config.localLlmTopP !== undefined) {
    args.push("--top-p", String(config.localLlmTopP));
  }

  if (config.localLlmReasoning) {
    args.push("--reasoning", config.localLlmReasoning);
  }

  if (config.localLlmSleepIdleSeconds !== undefined) {
    args.push("--sleep-idle-seconds", String(config.localLlmSleepIdleSeconds));
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
  if (child.pid) {
    activeServerPid = child.pid;
  }
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
        if (activeServerPid === child.pid) {
          activeServerPid = null;
        }
        reject(new Error(`Failed to start llama.cpp server with ${binary}: ${error.message}`));
      });
      child.once("exit", (code) => {
        if (activeServerPid === child.pid) {
          activeServerPid = null;
        }
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
    try {
      await assertExpectedServerModel(apiBase, config.localLlmModelName);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Existing llama.cpp server does not match current model; reloading: ${message}`);
      await ensureModelFile(config);
      await stopExistingServerProcess(config.localLlmServerPort ?? 12370);
    }
  }

  const binary = config.localLlmServerBinary ?? "llama-server";
  if (!isLlamaServerBinaryAvailable(binary)) {
    throw new Error(
      `로컬 llama.cpp 서버 바이너리를 찾을 수 없습니다: ${binary}. llama-server를 설치하거나 LOCAL_LLM_AUTO_START=0으로 자동 시작을 끄세요.`,
    );
  }

  await ensureModelFile(config);

  try {
    await startServerProcess(config, apiBase);
    await assertExpectedServerModel(apiBase, config.localLlmModelName);
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
    await assertExpectedServerModel(apiBase, config.localLlmModelName);
  }
}

export async function ensureLocalLlmRuntime(config: Role1RuntimeConfig): Promise<void> {
  if (config.localLlmAutoStart === false) {
    return;
  }

  const signature = buildStartupSignature(config);
  if (startupPromise && startupSignature === signature) {
    await startupPromise;
    if (startupPromise !== null && startupSignature === signature) {
      startupPromise = null;
    }
    return;
  }

  if (startupSignature !== null && startupSignature !== signature) {
    await stopExistingServerProcess(config.localLlmServerPort ?? 12370);
  }

  startupSignature = signature;
  const nextStartupPromise = startLocalServer(config).catch((error) => {
    if (startupSignature === signature) {
      startupPromise = null;
      startupSignature = null;
    }
    throw error;
  });

  startupPromise = nextStartupPromise;

  try {
    await nextStartupPromise;
    lastUsedPort = config.localLlmServerPort ?? 12370;
    lastUsedModel = config.localLlmModelName;
  } finally {
    if (startupPromise === nextStartupPromise) {
      startupPromise = null;
    }
  }
}

export function getLastUsedLocalLlmInfo(): { port: number | undefined; model: string | undefined } {
  return {
    port: lastUsedPort,
    model: lastUsedModel,
  };
}
