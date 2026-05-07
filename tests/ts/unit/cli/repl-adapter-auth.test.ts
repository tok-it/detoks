import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  let authStarted = false;

  const resetAuthStarted = () => {
    authStarted = false;
  };

  const spawnSync = vi.fn(() => {
    authStarted = true;
    return { status: 0, error: undefined } as any;
  });

  const selectWithArrows = vi.fn();
  const getAdapterStatus = vi.fn();
  const getAdapterModels = vi.fn((adapter: "codex" | "gemini" | "claude") => {
    if (adapter === "codex") {
      expect(authStarted).toBe(true);
      return [{ slug: "gpt-5-codex", display_name: "GPT-5 Codex" }];
    }

    if (adapter === "gemini") {
      expect(authStarted).toBe(true);
      return [{ slug: "gemini-2.5-pro", display_name: "Gemini 2.5 Pro" }];
    }

    return [];
  });
  const getClaudeAvailableModels = vi.fn(() => [
    { slug: "claude-opus-4-7", display_name: "Claude Opus 4.7" },
    { slug: "claude-sonnet-4-6", display_name: "Claude Sonnet 4.6" },
    { slug: "claude-haiku-4-5", display_name: "Claude Haiku 4.5" },
  ]);
  const updateAdapterModel = vi.fn();
  const updateCodexReasoningEffort = vi.fn();
  const getCodexReasoningEffortOverride = vi.fn(() => undefined);
  const updateTranslationModel = vi.fn();
  const originalStdInTTY = process.stdin.isTTY;
  const originalStdOutTTY = process.stdout.isTTY;
  const originalAdapterModel = process.env.ADAPTER_MODEL;

  return {
    resetAuthStarted,
    spawnSync,
    selectWithArrows,
    getAdapterStatus,
    getAdapterModels,
    getClaudeAvailableModels,
    updateAdapterModel,
    updateCodexReasoningEffort,
    getCodexReasoningEffortOverride,
    updateTranslationModel,
    originalStdInTTY,
    originalStdOutTTY,
    originalAdapterModel,
  };
});

vi.mock("node:child_process", () => ({
  spawnSync: mocks.spawnSync,
}));

vi.mock("../../../../src/cli/interactive/select-with-arrows.js", () => ({
  selectWithArrows: mocks.selectWithArrows,
}));

vi.mock("../../../../src/cli/adapter-info/index.js", () => ({
  getAdapterStatus: mocks.getAdapterStatus,
  getAdapterModels: mocks.getAdapterModels,
  getClaudeAvailableModels: mocks.getClaudeAvailableModels,
  codexLogout: vi.fn(() => true),
  geminiLogout: vi.fn(() => true),
  claudeLogout: vi.fn(() => true),
}));

vi.mock("../../../../src/cli/config/config-manager.js", () => ({
  getCodexReasoningEffortOverride: mocks.getCodexReasoningEffortOverride,
  updateAdapterModel: mocks.updateAdapterModel,
  updateCodexReasoningEffort: mocks.updateCodexReasoningEffort,
  updateTranslationModel: mocks.updateTranslationModel,
}));

import { handleAdapterSwitch } from "../../../../src/cli/repl-commands/index.js";
import { handleSlashCommand } from "../../../../src/cli/repl-commands/index.js";

const restoreTTY = () => {
  Object.defineProperty(process.stdin, "isTTY", {
    configurable: true,
    value: mocks.originalStdInTTY,
  });
  Object.defineProperty(process.stdout, "isTTY", {
    configurable: true,
    value: mocks.originalStdOutTTY,
  });
  if (mocks.originalAdapterModel === undefined) {
    delete process.env.ADAPTER_MODEL;
  } else {
    process.env.ADAPTER_MODEL = mocks.originalAdapterModel;
  }
};

describe("adapter auth flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetAuthStarted();
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: true,
    });
    mocks.getAdapterStatus.mockImplementation((adapter: "codex" | "gemini" | "claude") => ({
      authenticated: false,
      account: adapter === "codex" ? "codex-user" : undefined,
      authType: adapter === "gemini" ? "google" : undefined,
      currentModel: undefined,
    }));
  });

  afterEach(() => {
    restoreTTY();
  });

  it("authenticates immediately after selecting claude", async () => {
    mocks.selectWithArrows.mockImplementation(async (_options, title, streams) => {
      streams?.onOpen?.();
      const value = title === "어댑터 선택" ? "claude" : null;
      streams?.onClose?.();
      return value;
    });

    const onAdapterChange = vi.fn(async () => undefined);

    const handled = await handleAdapterSwitch(
      "codex",
      onAdapterChange,
      {
        onOpen: vi.fn(),
        onClose: vi.fn(),
      },
    );

    expect(handled).toBe(true);
    expect(mocks.spawnSync).toHaveBeenCalledWith(
      "claude",
      ["auth", "login"],
      expect.objectContaining({
        stdio: "inherit",
      }),
    );
    expect(onAdapterChange).toHaveBeenCalledWith("claude");
    expect(mocks.getAdapterModels).not.toHaveBeenCalledWith("codex");
    expect(mocks.getAdapterModels).not.toHaveBeenCalledWith("gemini");
  });

  it("loads claude model choices after auth and stores the selected model", async () => {
    mocks.selectWithArrows.mockImplementation(async (_options, title, streams) => {
      streams?.onOpen?.();

      let value: string | null = null;
      if (title === "어댑터 선택") {
        value = "claude";
      } else if (title === "Claude 모델 선택") {
        value = "claude-sonnet-4-6";
      }

      streams?.onClose?.();
      return value;
    });

    const onAdapterChange = vi.fn(async () => undefined);

    const handled = await handleAdapterSwitch(
      "codex",
      onAdapterChange,
      {
        onOpen: vi.fn(),
        onClose: vi.fn(),
      },
    );

    expect(handled).toBe(true);
    expect(mocks.spawnSync).toHaveBeenCalledWith(
      "claude",
      ["auth", "login"],
      expect.objectContaining({
        stdio: "inherit",
      }),
    );
    expect(onAdapterChange).toHaveBeenCalledWith("claude");
    expect(mocks.getClaudeAvailableModels).toHaveBeenCalledTimes(1);
    expect(mocks.updateAdapterModel).toHaveBeenCalledWith("claude", "claude-sonnet-4-6");
    expect(process.env.ADAPTER_MODEL).toBe("claude-sonnet-4-6");
  });

  it("authenticates before showing codex model choices", async () => {
    mocks.selectWithArrows.mockImplementation(async (_options, title, streams) => {
      streams?.onOpen?.();

      let value: string | null = null;
      if (title === "어댑터 선택") {
        value = "codex";
      } else if (title === "Codex 모델 선택") {
        value = "gpt-5-codex";
      } else if (title === "추론 강도 선택") {
        value = "high";
      }

      streams?.onClose?.();
      return value;
    });

    const onAdapterChange = vi.fn(async () => undefined);

    const handled = await handleAdapterSwitch(
      "codex",
      onAdapterChange,
      {
        onOpen: vi.fn(),
        onClose: vi.fn(),
      },
    );

    expect(handled).toBe(true);
    expect(mocks.spawnSync).toHaveBeenCalledWith(
      "codex",
      ["login"],
      expect.objectContaining({
        stdio: "inherit",
      }),
    );
    expect(onAdapterChange).toHaveBeenCalledWith("codex");
    expect(mocks.updateAdapterModel).toHaveBeenCalledWith("codex", "gpt-5-codex");
    expect(mocks.updateCodexReasoningEffort).toHaveBeenCalledWith("high");
    expect(mocks.getAdapterModels).toHaveBeenCalledWith("codex");
  });

  it("opens a slash-command picker for / and executes the selected command", async () => {
    mocks.selectWithArrows.mockImplementation(async (options, title) => {
      expect(title).toBe("REPL 명령 선택");
      expect(options.some((option: { value: string }) => option.value === "/help")).toBe(true);
      return "/help";
    });

    const handled = await handleSlashCommand("/", {
      adapter: "codex",
      executionMode: "stub",
      modelName: undefined,
      verbose: false,
      onVerboseToggle: vi.fn(),
      onAdapterChange: vi.fn(async () => undefined),
      onExit: vi.fn(async () => undefined),
      onInteractiveStart: vi.fn(),
      onInteractiveEnd: vi.fn(),
    });

    expect(handled).toBe(true);
    expect(mocks.selectWithArrows).toHaveBeenCalledTimes(1);
    expect(mocks.selectWithArrows.mock.calls[0]?.[1]).toBe("REPL 명령 선택");
  });

  it("requests a main-screen restore after adapter model selection finishes", async () => {
    mocks.getAdapterStatus.mockImplementation((adapter: "codex" | "gemini" | "claude") => ({
      authenticated: adapter === "codex",
      account: adapter === "codex" ? "codex-user" : undefined,
      authType: adapter === "gemini" ? "google" : undefined,
      currentModel: undefined,
    }));
    mocks.getAdapterModels.mockImplementation((adapter: "codex" | "gemini" | "claude") => {
      if (adapter === "codex") {
        return [{ slug: "gpt-5-codex", display_name: "GPT-5 Codex" }];
      }

      return [];
    });
    mocks.selectWithArrows.mockImplementation(async (_options, title) => {
      if (title === "Codex 모델 선택") {
        return "gpt-5-codex";
      }

      if (title === "추론 강도 선택") {
        return null;
      }

      return null;
    });

    const onMainScreenRestore = vi.fn();

    const handled = await handleSlashCommand("/codex-models", {
      adapter: "codex",
      executionMode: "stub",
      modelName: undefined,
      verbose: false,
      onVerboseToggle: vi.fn(),
      onAdapterChange: vi.fn(async () => undefined),
      onExit: vi.fn(async () => undefined),
      onMainScreenRestore,
      onInteractiveStart: vi.fn(),
      onInteractiveEnd: vi.fn(),
    });

    expect(handled).toBe(true);
    expect(onMainScreenRestore).toHaveBeenCalledTimes(1);
  });
});
