import { beforeEach, describe, expect, it, vi } from "vitest";

const adapterInfoMocks = vi.hoisted(() => {
  const getAdapterModel = vi.fn(() => "claude-sonnet-4-6");
  const getClaudeLoginStatus = vi.fn(() => ({
    authenticated: true,
    authType: "oauth / claude.ai",
    apiProvider: "claude.ai",
  }));
  const getClaudeAvailableModels = vi.fn(() => [
    { slug: "claude-sonnet-4-6", display_name: "Claude Sonnet 4.6" },
  ]);
  const getCodexLoginStatus = vi.fn();
  const getCodexAvailableModels = vi.fn();
  const getGeminiLoginStatus = vi.fn();
  const getGeminiAvailableModels = vi.fn();
  const getGeminiConfig = vi.fn();

  return {
    getAdapterModel,
    getClaudeLoginStatus,
    getClaudeAvailableModels,
    getCodexLoginStatus,
    getCodexAvailableModels,
    getGeminiLoginStatus,
    getGeminiAvailableModels,
    getGeminiConfig,
  };
});

vi.mock("../../../../src/cli/config/config-manager.js", () => ({
  getAdapterModel: adapterInfoMocks.getAdapterModel,
}));

vi.mock("../../../../src/cli/adapter-info/claude.js", () => ({
  getClaudeLoginStatus: adapterInfoMocks.getClaudeLoginStatus,
  getClaudeAvailableModels: adapterInfoMocks.getClaudeAvailableModels,
  claudeLogout: vi.fn(() => true),
}));

vi.mock("../../../../src/cli/adapter-info/codex.js", () => ({
  getCodexLoginStatus: adapterInfoMocks.getCodexLoginStatus,
  getCodexAvailableModels: adapterInfoMocks.getCodexAvailableModels,
  codexLogout: vi.fn(() => true),
}));

vi.mock("../../../../src/cli/adapter-info/gemini.js", () => ({
  getGeminiLoginStatus: adapterInfoMocks.getGeminiLoginStatus,
  getGeminiAvailableModels: adapterInfoMocks.getGeminiAvailableModels,
  getGeminiConfig: adapterInfoMocks.getGeminiConfig,
  geminiLogout: vi.fn(() => true),
}));

import {
  getAdapterModels,
  getAdapterStatus,
} from "../../../../src/cli/adapter-info/index.js";

describe("adapter-info index claude wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds claude adapter status from the claude adapter info branch", () => {
    expect(getAdapterStatus("claude")).toEqual({
      authenticated: true,
      account: undefined,
      authType: "oauth / claude.ai",
      currentModel: "claude-sonnet-4-6",
    });
    expect(adapterInfoMocks.getClaudeLoginStatus).toHaveBeenCalledTimes(1);
    expect(adapterInfoMocks.getAdapterModel).toHaveBeenCalledWith("claude");
  });

  it("delegates claude model lookup to the claude adapter info module", () => {
    expect(getAdapterModels("claude")).toEqual([
      { slug: "claude-sonnet-4-6", display_name: "Claude Sonnet 4.6" },
    ]);
    expect(adapterInfoMocks.getClaudeAvailableModels).toHaveBeenCalledTimes(1);
    expect(adapterInfoMocks.getCodexAvailableModels).not.toHaveBeenCalled();
    expect(adapterInfoMocks.getGeminiAvailableModels).not.toHaveBeenCalled();
  });
});
