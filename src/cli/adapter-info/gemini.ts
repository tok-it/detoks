import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

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

export const getGeminiConfig = (): GeminiConfig => {
  try {
    const content = readFileSync(getGeminiConfigPath(), "utf-8");
    const config = JSON.parse(content);
    return {
      currentModel: config.model?.name || undefined,
      authType: config.security?.auth?.selectedType || "unknown",
    };
  } catch {
    return {};
  }
};

export const getGeminiLoginStatus = (): GeminiLoginStatus => {
  try {
    const config = getGeminiConfig();
    return {
      authenticated: !!config.authType,
      authType: config.authType,
    };
  } catch {
    return { authenticated: false, authType: undefined };
  }
};

export const getGeminiAvailableModels = () => {
  return GEMINI_MODELS;
};
