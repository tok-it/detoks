import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const selectWithArrows = vi.fn(async (_options, title, streams) => {
    streams?.onOpen?.();
    const value = title.includes("Codex 모델 선택") ? "gpt-5-codex" : "high";
    streams?.onClose?.();
    return value;
  });

  const getAdapterStatus = vi.fn(() => ({
    authenticated: true,
    account: "test-account",
    authType: undefined,
    currentModel: undefined,
  }));

  const getAdapterModels = vi.fn((adapter: "codex" | "gemini") =>
    adapter === "codex"
      ? [{ slug: "gpt-5-codex", display_name: "GPT-5 Codex" }]
      : [{ slug: "gemini-2.5-pro", display_name: "Gemini 2.5 Pro" }],
  );

  const updateAdapterModel = vi.fn();
  const updateCodexReasoningEffort = vi.fn();
  const getCodexReasoningEffortOverride = vi.fn(() => undefined);
  const updateTranslationModel = vi.fn();
  const codexLogout = vi.fn(() => true);
  const geminiLogout = vi.fn(() => true);

  return {
    selectWithArrows,
    getAdapterStatus,
    getAdapterModels,
    updateAdapterModel,
    updateCodexReasoningEffort,
    getCodexReasoningEffortOverride,
    updateTranslationModel,
    codexLogout,
    geminiLogout,
  };
});

vi.mock("../../../../src/cli/interactive/select-with-arrows.js", () => ({
  selectWithArrows: mocks.selectWithArrows,
}));

vi.mock("../../../../src/cli/adapter-info/index.js", () => ({
  getAdapterStatus: mocks.getAdapterStatus,
  getAdapterModels: mocks.getAdapterModels,
  codexLogout: mocks.codexLogout,
  geminiLogout: mocks.geminiLogout,
}));

vi.mock("../../../../src/cli/config/config-manager.js", () => ({
  getCodexReasoningEffortOverride: mocks.getCodexReasoningEffortOverride,
  updateAdapterModel: mocks.updateAdapterModel,
  updateCodexReasoningEffort: mocks.updateCodexReasoningEffort,
  updateTranslationModel: mocks.updateTranslationModel,
}));

import { handleSlashCommand } from "../../../../src/cli/repl-commands/index.js";

const onOpen = vi.fn();
const onClose = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/cms repl flow", () => {
  it("keeps the REPL paused between model selection and reasoning selection", async () => {
    const handled = await handleSlashCommand("/cms", {
      adapter: "codex",
      executionMode: "stub",
      modelName: undefined,
      verbose: false,
      onVerboseToggle: vi.fn(),
      onAdapterChange: vi.fn(async () => undefined),
      onExit: vi.fn(async () => undefined),
      onInteractiveStart: onOpen,
      onInteractiveEnd: onClose,
    });

    expect(handled).toBe(true);
    expect(mocks.getAdapterModels).toHaveBeenCalledWith("codex");
    expect(mocks.selectWithArrows).toHaveBeenCalledTimes(2);
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mocks.updateAdapterModel).toHaveBeenCalledWith("codex", "gpt-5-codex");
    expect(mocks.updateCodexReasoningEffort).toHaveBeenCalledWith("high");
  });
});
