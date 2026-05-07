import { execSync } from "node:child_process";
import { invalidateCache, readCache, writeCache } from "../cache/cache-manager.js";
import { CACHE_TTL_MS } from "../cache/cache-policy.js";

export interface ClaudeLoginStatus {
  authenticated: boolean;
  authType: string | undefined;
  apiProvider: string | undefined;
}

export const getClaudeLoginStatus = (): ClaudeLoginStatus => {
  const cached = readCache<ClaudeLoginStatus>("adapter-status", "claude", CACHE_TTL_MS.adapterStatus);
  if (cached) {
    return cached;
  }

  try {
    const output = execSync("claude auth status --json 2>&1", { encoding: "utf-8" }).trim();
    const status = JSON.parse(output) as {
      loggedIn?: boolean;
      authMethod?: string;
      apiProvider?: string;
    };

    const result = {
      authenticated: Boolean(status.loggedIn),
      authType: status.loggedIn
        ? [status.authMethod, status.apiProvider].filter(Boolean).join(" / ") || "authenticated"
        : undefined,
      apiProvider: status.apiProvider,
    };
    writeCache("adapter-status", "claude", result, CACHE_TTL_MS.adapterStatus);
    return result;
  } catch {
    return {
      authenticated: false,
      authType: undefined,
      apiProvider: undefined,
    };
  }
};

export interface ClaudeModel {
  slug: string;
  display_name: string;
}

// Claude Code CLI는 --model에 별칭 또는 전체 모델명을 허용한다.
// detoks는 현재 안정적으로 확인된 모델군만 노출한다.
export const CLAUDE_MODELS: ClaudeModel[] = [
  { slug: "claude-opus-4-7", display_name: "Claude Opus 4.7" },
  { slug: "claude-sonnet-4-6", display_name: "Claude Sonnet 4.6" },
  { slug: "claude-haiku-4-5", display_name: "Claude Haiku 4.5" },
];

export const getClaudeAvailableModels = (): ClaudeModel[] => CLAUDE_MODELS;

export const claudeLogout = (): boolean => {
  try {
    execSync("claude auth logout 2>&1", { encoding: "utf-8" });
    invalidateCache("adapter-status", "claude");
    invalidateCache("adapter-models", "claude");
    return true;
  } catch {
    return false;
  }
};
