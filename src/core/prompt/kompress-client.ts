import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, delimiter, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { logger } from "../utils/logger.js";

const DEFAULT_PYTHON_BIN = "python3";
const DEFAULT_MODEL_ID = "chopratejas/kompress-base";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_STARTUP_TIMEOUT_MS = 120_000;

const pythonModuleRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../python",
);

export interface KompressClientOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  pythonBin?: string;
  modelId?: string;
  requestTimeoutMs?: number;
  startupTimeoutMs?: number;
}

export interface KompressClientResult {
  compressed: string;
  compression_ratio: number;
  tokens_saved: number;
  model_used?: string;
}

type WorkerLine =
  | {
      type: "ready";
      model_id: string;
    }
  | {
      type: "startup_error";
      error: string;
    }
  | ({
      id: string;
      ok: true;
    } & KompressClientResult)
  | {
      id: string;
      ok: false;
      error: string;
    };

interface PendingRequest {
  resolve: (value: KompressClientResult) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
}

interface WorkerHandle {
  key: string;
  child: ChildProcessWithoutNullStreams;
  pending: Map<string, PendingRequest>;
  stderrBuffer: string;
  startup: Promise<void>;
}

interface LauncherCandidate {
  command: string;
  args: string[];
  key: string;
}

let activeWorker: WorkerHandle | null = null;

function buildWorkerKey(options: KompressClientOptions): string {
  return JSON.stringify({
    pythonBin: options.pythonBin ?? DEFAULT_PYTHON_BIN,
    modelId: options.modelId ?? DEFAULT_MODEL_ID,
    cwd: options.cwd ?? process.cwd(),
  });
}

function buildLauncherCandidates(
  options: KompressClientOptions,
): LauncherCandidate[] {
  const cwd = options.cwd ?? process.cwd();
  const explicitPythonBin = options.pythonBin;
  const basePythonBin = explicitPythonBin ?? DEFAULT_PYTHON_BIN;

  if (explicitPythonBin && explicitPythonBin !== DEFAULT_PYTHON_BIN) {
    return [
      {
        command: "uv",
        args: ["run", "--python", explicitPythonBin, "python"],
        key: `uv:${explicitPythonBin}`,
      },
      {
        command: explicitPythonBin,
        args: [],
        key: explicitPythonBin,
      },
    ];
  }

  const candidates: LauncherCandidate[] = [];
  const localVenvPython = resolve(cwd, ".venv/bin/python");
  if (existsSync(localVenvPython)) {
    candidates.push({
      command: localVenvPython,
      args: [],
      key: localVenvPython,
    });
  }

  candidates.push(
    {
      command: "uv",
      args: ["run", "--python", basePythonBin, "python"],
      key: `uv:${basePythonBin}`,
    },
    {
      command: DEFAULT_PYTHON_BIN,
      args: [],
      key: DEFAULT_PYTHON_BIN,
    },
  );

  return candidates;
}

function buildWorkerEnv(options: KompressClientOptions): NodeJS.ProcessEnv {
  const cwd = options.cwd ?? process.cwd();
  const baseEnv = {
    ...process.env,
    ...options.env,
  };
  const pythonPathEntries = [
    pythonModuleRoot,
    ...(baseEnv.PYTHONPATH ? baseEnv.PYTHONPATH.split(delimiter).filter(Boolean) : []),
  ];

  return {
    ...baseEnv,
    PYTHONPATH: pythonPathEntries.join(delimiter),
    KOMPRESS_MODEL_ID: options.modelId ?? DEFAULT_MODEL_ID,
    UV_CACHE_DIR: baseEnv.UV_CACHE_DIR ?? resolve(cwd, ".state/uv-cache"),
  };
}

function rejectPendingRequests(
  worker: WorkerHandle,
  error: Error,
): void {
  for (const pending of worker.pending.values()) {
    clearTimeout(pending.timeoutId);
    pending.reject(error);
  }
  worker.pending.clear();
}

function resetWorker(worker: WorkerHandle): void {
  if (activeWorker === worker) {
    activeWorker = null;
  }
}

function killWorker(worker: WorkerHandle): void {
  worker.child.kill("SIGKILL");
  resetWorker(worker);
}

function createWorker(
  options: KompressClientOptions,
  launcher: LauncherCandidate,
): WorkerHandle {
  const child = spawn(
    launcher.command,
    [...launcher.args, "-u", "-m", "llama_server.kompress_worker"],
    {
      cwd: options.cwd ?? process.cwd(),
      env: buildWorkerEnv(options),
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  const pending = new Map<string, PendingRequest>();
  let startupResolve: (() => void) | null = null;
  let startupReject: ((error: Error) => void) | null = null;
  const startup = new Promise<void>((resolve, reject) => {
    startupResolve = resolve;
    startupReject = reject;
  });
  const worker: WorkerHandle = {
    key: `${buildWorkerKey(options)}:${launcher.key}`,
    child,
    pending,
    stderrBuffer: "",
    startup,
  };

  const startupTimeoutId = setTimeout(() => {
    startupReject?.(
      new Error(
        `Kompress worker startup timed out after ${
          options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS
        }ms`,
      ),
    );
    killWorker(worker);
  }, options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS);

  const stdout = createInterface({
    input: child.stdout,
    crlfDelay: Infinity,
  });

  stdout.on("line", (line) => {
    let payload: WorkerLine;
    try {
      payload = JSON.parse(line) as WorkerLine;
    } catch {
      logger.warn(`Ignoring invalid Kompress worker output: ${line}`);
      return;
    }

    if ("type" in payload) {
      if (payload.type === "ready") {
        clearTimeout(startupTimeoutId);
        startupResolve?.();
        return;
      }

      if (payload.type === "startup_error") {
        clearTimeout(startupTimeoutId);
        startupReject?.(new Error(`Kompress worker failed to start: ${payload.error}`));
        killWorker(worker);
      }
      return;
    }

    const request = pending.get(payload.id);
    if (!request) {
      return;
    }

    pending.delete(payload.id);
    clearTimeout(request.timeoutId);

    if (payload.ok) {
      request.resolve({
        compressed: payload.compressed,
        compression_ratio: payload.compression_ratio,
        tokens_saved: payload.tokens_saved,
        ...(payload.model_used ? { model_used: payload.model_used } : {}),
      });
      return;
    }

    request.reject(new Error(payload.error));
  });

  child.stderr.on("data", (chunk: string) => {
    worker.stderrBuffer = `${worker.stderrBuffer}${chunk}`.slice(-4_000);
  });

  child.once("error", (error) => {
    clearTimeout(startupTimeoutId);
    const wrapped = new Error(`Failed to spawn Kompress worker: ${error.message}`);
    startupReject?.(wrapped);
    rejectPendingRequests(worker, wrapped);
    resetWorker(worker);
  });

  child.once("close", (code, signal) => {
    clearTimeout(startupTimeoutId);
    const stderrText = worker.stderrBuffer.trim();
    const detail = stderrText ? `\n${stderrText}` : "";
    const error = new Error(
      `Kompress worker exited unexpectedly (code=${code ?? "null"}, signal=${
        signal ?? "null"
      })${detail}`,
    );
    startupReject?.(error);
    rejectPendingRequests(worker, error);
    resetWorker(worker);
  });

  return worker;
}

async function ensureWorker(
  options: KompressClientOptions,
): Promise<WorkerHandle> {
  const nextKey = buildWorkerKey(options);
  if (activeWorker && !activeWorker.key.startsWith(`${nextKey}:`)) {
    killWorker(activeWorker);
  }

  if (!activeWorker) {
    const startupErrors: string[] = [];
    const launchers = buildLauncherCandidates(options);

    for (const launcher of launchers) {
      const worker = createWorker(options, launcher);
      try {
        await worker.startup;
        activeWorker = worker;
        return worker;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        startupErrors.push(`${launcher.key}: ${message}`);
        logger.warn(`Kompress worker launcher failed: ${launcher.key} (${message})`);
        killWorker(worker);
      }
    }

    throw new Error(
      `Kompress worker failed to start with any launcher: ${startupErrors.join(" | ")}`,
    );
  }

  await activeWorker.startup;
  return activeWorker;
}

export async function compressTextWithKompress(
  text: string,
  options: KompressClientOptions = {},
): Promise<KompressClientResult> {
  const worker = await ensureWorker(options);
  const id = randomUUID();

  return await new Promise<KompressClientResult>((resolve, reject) => {
    const timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const timeoutId = setTimeout(() => {
      worker.pending.delete(id);
      reject(new Error(`Kompress request timed out after ${timeoutMs}ms`));
      killWorker(worker);
    }, timeoutMs);

    worker.pending.set(id, { resolve, reject, timeoutId });

    try {
      worker.child.stdin.write(`${JSON.stringify({ id, text })}\n`);
    } catch (error) {
      worker.pending.delete(id);
      clearTimeout(timeoutId);
      reject(
        error instanceof Error
          ? error
          : new Error(`Failed to write Kompress request: ${String(error)}`),
      );
      killWorker(worker);
    }
  });
}

export function resetKompressWorkerForTests(): void {
  if (!activeWorker) {
    return;
  }

  killWorker(activeWorker);
}
