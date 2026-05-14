import type { Role1RuntimeConfig } from "../prompt/config.js";
import {
  buildNodeLlamaRuntimeSignature,
  ensureNodeLlamaCppRuntime,
  shutdownNodeLlamaCppRuntime,
} from "./node-llama-runtime.js";

type LocalLlmRuntimeProvider = NonNullable<
  Role1RuntimeConfig["localLlmRuntimeProvider"]
>;

let startupPromise: Promise<LocalLlmRuntimeProvider> | null = null;
let startupSignature: string | null = null;
let activeRuntimeProvider: LocalLlmRuntimeProvider | null = null;
let lastUsedModel: string | undefined = undefined;

function getRuntimeProvider(config: Role1RuntimeConfig): LocalLlmRuntimeProvider {
  return config.localLlmRuntimeProvider ?? "node-llama-cpp";
}

function buildStartupSignature(config: Role1RuntimeConfig): string {
  return JSON.stringify({
    provider: getRuntimeProvider(config),
    runtime: buildNodeLlamaRuntimeSignature(config),
  });
}

function clearManagedRuntimeState(): void {
  startupPromise = null;
  startupSignature = null;
  activeRuntimeProvider = null;
}

export function getActiveLocalLlmRuntimeProvider():
  | LocalLlmRuntimeProvider
  | null {
  return activeRuntimeProvider;
}

async function startLocalRuntime(
  config: Role1RuntimeConfig,
): Promise<LocalLlmRuntimeProvider> {
  const provider = getRuntimeProvider(config);
  await ensureNodeLlamaCppRuntime(config);
  return provider;
}

export async function ensureLocalLlmRuntime(
  config: Role1RuntimeConfig,
): Promise<void> {
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

  if (!startupPromise && startupSignature === signature && activeRuntimeProvider !== null) {
    return;
  }

  if (startupSignature !== null && startupSignature !== signature) {
    await shutdownManagedLocalLlmRuntime();
  }

  startupSignature = signature;
  const nextStartupPromise: Promise<LocalLlmRuntimeProvider> =
    startLocalRuntime(config).catch((error) => {
      if (startupSignature === signature) {
        startupPromise = null;
        startupSignature = null;
        activeRuntimeProvider = null;
      }
      throw error;
    });

  startupPromise = nextStartupPromise;

  try {
    const actualProvider = await nextStartupPromise;
    activeRuntimeProvider = actualProvider;
    lastUsedModel = config.localLlmModelName;
  } finally {
    if (startupPromise === nextStartupPromise) {
      startupPromise = null;
    }
  }
}

export async function shutdownManagedLocalLlmRuntime(): Promise<boolean> {
  const provider = activeRuntimeProvider;
  clearManagedRuntimeState();

  if (provider === "node-llama-cpp") {
    return await shutdownNodeLlamaCppRuntime();
  }

  return false;
}

export function getLastUsedLocalLlmInfo(): {
  port: number | undefined;
  model: string | undefined;
} {
  return {
    port: undefined,
    model: lastUsedModel,
  };
}
