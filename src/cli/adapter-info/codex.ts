import { execSync } from "node:child_process";
import { invalidateCache, readCache, writeCache } from "../cache/cache-manager.js";
import { CACHE_TTL_MS } from "../cache/cache-policy.js";

export interface CodexModel {
  slug: string;
  display_name: string;
}

export interface CodexLoginStatus {
  authenticated: boolean;
  account?: string;
}

export const getCodexLoginStatus = (): CodexLoginStatus => {
  const cached = readCache<CodexLoginStatus>("adapter-status", "codex", CACHE_TTL_MS.adapterStatus);
  if (cached) {
    return cached;
  }

  try {
    const output = execSync("codex login status 2>&1", { encoding: "utf-8" }).trim();
    const status = output.toLowerCase().includes("logged in")
      ? {
        authenticated: true,
        account: output.replace(/^Logged in using\s+/, "").trim(),
      }
      : { authenticated: false };

    writeCache("adapter-status", "codex", status, CACHE_TTL_MS.adapterStatus);
    return status;
  } catch {
    return { authenticated: false };
  }
};

export const getCodexAvailableModels = (): CodexModel[] => {
  const cached = readCache<CodexModel[]>("adapter-models", "codex", CACHE_TTL_MS.adapterModels);
  if (cached) {
    return cached;
  }

  try {
    const output = execSync("codex debug models 2>&1", { encoding: "utf-8" });
    const data = JSON.parse(output);
    const models = (data.models || [])
      .filter((m: { visibility?: string }) => m.visibility === "list")
      .slice(0, 10)
      .map((m: CodexModel) => ({
        slug: m.slug,
        display_name: m.display_name,
      }));
    writeCache("adapter-models", "codex", models, CACHE_TTL_MS.adapterModels);
    return models;
  } catch {
    return [];
  }
};

export const codexLogout = (): boolean => {
  try {
    execSync("codex logout 2>&1", { encoding: "utf-8" });
    invalidateCache("adapter-status", "codex");
    invalidateCache("adapter-models", "codex");
    return true;
  } catch {
    return false;
  }
};
