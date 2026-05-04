import type { Adapter } from "../../core/pipeline/types.js";
import { getAdapterModel } from "../config/config-manager.js";
import {
  getClaudeLoginStatus,
  getClaudeAvailableModels,
  claudeLogout,
} from "./claude.js";
import {
  getCodexLoginStatus,
  getCodexAvailableModels,
  codexLogout,
  type CodexModel,
  type CodexLoginStatus,
} from "./codex.js";
import {
  getGeminiLoginStatus,
  getGeminiAvailableModels,
  getGeminiConfig,
  geminiLogout,
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
  adapter: Adapter,
): AdapterStatus => {
  const currentModel = getAdapterModel(adapter);

  if (adapter === "codex") {
    const status = getCodexLoginStatus();
    return {
      authenticated: status.authenticated,
      account: status.account,
      authType: undefined,
      currentModel,
    };
  }

  if (adapter === "gemini") {
    const status = getGeminiLoginStatus();
    const config = getGeminiConfig();
    return {
      authenticated: status.authenticated,
      account: undefined,
      authType: status.authType,
      currentModel: config.currentModel ?? currentModel,
    };
  }

  const status = getClaudeLoginStatus();
  return {
    authenticated: status.authenticated,
    account: undefined,
    authType: status.authType,
    currentModel,
  };
};

export const getAdapterModels = (
  adapter: Adapter,
): AdapterModel[] => {
  if (adapter === "codex") {
    return getCodexAvailableModels();
  }

  if (adapter === "gemini") {
    return getGeminiAvailableModels();
  }

  return getClaudeAvailableModels();
};

export { getCodexLoginStatus, getCodexAvailableModels, codexLogout };
export { getGeminiLoginStatus, getGeminiAvailableModels, getGeminiConfig, geminiLogout };
export { getClaudeLoginStatus, getClaudeAvailableModels, claudeLogout };
