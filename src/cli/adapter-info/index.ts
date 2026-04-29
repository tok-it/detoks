import {
  getCodexLoginStatus,
  getCodexAvailableModels,
  type CodexModel,
  type CodexLoginStatus,
} from "./codex.js";
import {
  getGeminiLoginStatus,
  getGeminiAvailableModels,
  getGeminiConfig,
  GEMINI_MODELS,
  type GeminiLoginStatus,
} from "./gemini.js";

export interface AdapterStatus {
  authenticated: boolean;
  account: string | undefined;
  authType: string | undefined;
  currentModel: string | undefined;
}

export interface AdapterModel {
  slug: string;
  display_name: string;
}

export const getAdapterStatus = (
  adapter: "codex" | "gemini",
): AdapterStatus => {
  if (adapter === "codex") {
    const status = getCodexLoginStatus();
    return {
      authenticated: status.authenticated,
      account: status.account,
      authType: undefined,
      currentModel: undefined,
    };
  } else {
    const status = getGeminiLoginStatus();
    const config = getGeminiConfig();
    return {
      authenticated: status.authenticated,
      account: undefined,
      authType: status.authType,
      currentModel: config.currentModel,
    };
  }
};

export const getAdapterModels = (
  adapter: "codex" | "gemini",
): AdapterModel[] => {
  if (adapter === "codex") {
    return getCodexAvailableModels();
  } else {
    return getGeminiAvailableModels();
  }
};

export { getCodexLoginStatus, getCodexAvailableModels };
export { getGeminiLoginStatus, getGeminiAvailableModels, getGeminiConfig };
