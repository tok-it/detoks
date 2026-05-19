import { describe, expect, it, vi, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  runTuiRepl: vi.fn(async () => undefined),
  runModelSetupIfNeeded: vi.fn(async () => undefined),
  loadAndApplyConfig: vi.fn(),
  getAdapterModel: vi.fn(() => "gpt-5-codex"),
  getCodexReasoningEffortOverride: vi.fn(() => undefined),
  getTranslationModel: vi.fn(() => "detoks-local-model"),
  updateSelectedAdapter: vi.fn(),
}));

vi.mock("../../../../src/cli/tui/index.js", () => ({
  runTuiRepl: mocks.runTuiRepl,
}));

vi.mock("../../../../src/cli/model-setup/index.js", () => ({
  runModelSetupIfNeeded: mocks.runModelSetupIfNeeded,
}));

vi.mock("../../../../src/cli/config/loader.js", () => ({
  loadAndApplyConfig: mocks.loadAndApplyConfig,
}));

vi.mock("../../../../src/cli/config/config-manager.js", () => ({
  getAdapterModel: mocks.getAdapterModel,
  getCodexReasoningEffortOverride: mocks.getCodexReasoningEffortOverride,
  getTranslationModel: mocks.getTranslationModel,
  updateSelectedAdapter: mocks.updateSelectedAdapter,
}));

import { runReplCommand } from "../../../../src/cli/commands/repl.js";

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("runReplCommand TUI startup flow", () => {
  it("passes config state to the TUI and defers model setup into the TUI flow", async () => {
    await runReplCommand({
      mode: "repl",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      trace: false,
      tui: "force",
      showHelp: false,
    });

    expect(mocks.loadAndApplyConfig).toHaveBeenCalledWith("codex");
    expect(mocks.getAdapterModel).toHaveBeenCalledWith("codex");
    expect(mocks.getCodexReasoningEffortOverride).toHaveBeenCalledTimes(1);
    expect(mocks.runModelSetupIfNeeded).not.toHaveBeenCalled();
    expect(mocks.runTuiRepl).toHaveBeenCalledWith(
      expect.objectContaining({
        adapter: "codex",
        adapterModel: "gpt-5-codex",
        inferenceStrength: "medium",
        translationModel: "detoks-local-model",
        executionMode: "stub",
        verbose: false,
      }),
    );
  });

  it("passes passthrough presentation mode into the TUI startup flow", async () => {
    await runReplCommand({
      mode: "repl",
      adapter: "codex",
      executionMode: "real",
      verbose: false,
      trace: false,
      tui: "force",
      presentationMode: "passthrough",
      showHelp: false,
    });

    expect(mocks.runTuiRepl).toHaveBeenCalledWith(
      expect.objectContaining({
        presentationMode: "passthrough",
      }),
    );
  });

  it("passes embedded presentation mode into the TUI startup flow", async () => {
    await runReplCommand({
      mode: "repl",
      adapter: "codex",
      executionMode: "real",
      verbose: false,
      trace: false,
      tui: "force",
      sessionId: "demo-session",
      presentationMode: "embedded-pane",
      showHelp: false,
    });

    expect(mocks.runTuiRepl).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "demo-session",
        presentationMode: "embedded-pane",
      }),
    );
  });
});
