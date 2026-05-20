import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { invalidateCache, readCache, writeCache } from "../cache/cache-manager.js";
import { CACHE_TTL_MS } from "../cache/cache-policy.js";

export interface GeminiLoginStatus {
  authenticated: boolean;
  authType: string | undefined;
}

export interface GeminiConfig {
  currentModel?: string;
  authType?: string;
}

// Known Gemini models (as of 2026-04)
export const GEMINI_MODELS = [
  { slug: "gemini-3.1-pro-preview", display_name: "Gemini 3.1 Pro (Preview)" },
  { slug: "gemini-3.0-pro", display_name: "Gemini 3.0 Pro" },
  { slug: "gemini-2.0-flash", display_name: "Gemini 2.0 Flash" },
  { slug: "gemini-1.5-pro", display_name: "Gemini 1.5 Pro" },
  { slug: "gemini-1.5-flash", display_name: "Gemini 1.5 Flash" },
];

const getGeminiConfigPath = (): string => {
  return join(homedir(), ".gemini", "settings.json");
};

const getGeminiOAuthCredsPath = (): string => {
  return join(homedir(), ".gemini", "oauth_creds.json");
};

const hasFreshGeminiOAuthAccessToken = (): boolean => {
  try {
    const parsed = JSON.parse(readFileSync(getGeminiOAuthCredsPath(), "utf-8")) as {
      access_token?: unknown;
      expiry_date?: unknown;
    };
    const expiryDate =
      typeof parsed.expiry_date === "number"
        ? parsed.expiry_date
        : typeof parsed.expiry_date === "string"
          ? Number.parseInt(parsed.expiry_date, 10)
          : NaN;

    return (
      typeof parsed.access_token === "string" &&
      parsed.access_token.trim().length > 0 &&
      Number.isFinite(expiryDate) &&
      expiryDate > Date.now()
    );
  } catch {
    return false;
  }
};

export const getGeminiConfig = (): GeminiConfig => {
  const cached = readCache<GeminiConfig>("adapter-config", "gemini", CACHE_TTL_MS.adapterConfig);
  if (cached) {
    return cached;
  }

  try {
    const content = readFileSync(getGeminiConfigPath(), "utf-8");
    const config = JSON.parse(content);
    const result = {
      currentModel: config.model?.name || undefined,
      authType: config.security?.auth?.selectedType || "unknown",
    };
    writeCache("adapter-config", "gemini", result, CACHE_TTL_MS.adapterConfig);
    return result;
  } catch {
    return {};
  }
};

export const getGeminiLoginStatus = (): GeminiLoginStatus => {
  const cached = readCache<GeminiLoginStatus>("adapter-status", "gemini", CACHE_TTL_MS.adapterStatus);
  if (cached) {
    return cached;
  }

  const config = getGeminiConfig();
  const authType = config.authType;
  const authenticated = authType
    ? authType.toLowerCase().includes("oauth")
      ? hasFreshGeminiOAuthAccessToken()
      : true
    : false;
  const status = {
    authenticated,
    authType,
  };

  writeCache("adapter-status", "gemini", status, CACHE_TTL_MS.adapterStatus);
  return status;
};

export const getGeminiAvailableModels = () => {
  return GEMINI_MODELS;
};

export const geminiLogout = (): boolean => {
  try {
    const configPath = getGeminiOAuthCredsPath();
    if (existsSync(configPath)) {
      unlinkSync(configPath);
    }
    invalidateCache("adapter-status", "gemini");
    invalidateCache("adapter-config", "gemini");
    return true;
  } catch {
    return false;
  }
};
