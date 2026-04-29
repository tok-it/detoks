import { describe, expect, it } from "vitest";
import {
  getLoginCommandSpec,
  getNextLoginSelectionIndex,
  getNextSelectionIndex,
  getReplBuiltinCommand,
  getReplPromptLabel,
  getReplSourceBadgeKey,
  resolveReplSessionId,
  shouldEmitReplSourceBadge,
  runReplBuiltinCommand,
} from "../../../../src/cli/commands/repl.js";
import type { ReplSession } from "../../../../src/cli/repl/ReplRegistry.js";

const lastSession: ReplSession = {
  project_id: "detoks",
  session_id: "repl-existing-session",
  adapter: "codex",
  execution_mode: "stub",
  created_at: "2026-04-28T00:00:00.000Z",
  last_resumed_at: "2026-04-28T01:23:45.000Z",
};

describe("repl builtin command routing", () => {
  it("routes /help to the repl help builtin", () => {
    expect(getReplBuiltinCommand("/help")).toEqual({ kind: "help" });
  });

  it("routes /login to the repl login builtin", () => {
    expect(getReplBuiltinCommand("/login")).toEqual({ kind: "login" });
  });

  it("routes exit variants to the repl exit builtin", () => {
    expect(getReplBuiltinCommand("exit")).toEqual({ kind: "exit" });
    expect(getReplBuiltinCommand("quit")).toEqual({ kind: "exit" });
    expect(getReplBuiltinCommand(".exit")).toEqual({ kind: "exit" });
    expect(getReplBuiltinCommand("/exit")).toEqual({ kind: "exit" });
    expect(getReplBuiltinCommand("/quit")).toEqual({ kind: "exit" });
  });

  it("routes session and runtime builtins", () => {
    expect(getReplBuiltinCommand("/session")).toEqual({ kind: "session" });
    expect(getReplBuiltinCommand("/adapter")).toEqual({ kind: "adapter" });
    expect(getReplBuiltinCommand("/adapter gemini")).toEqual({
      kind: "adapter",
      adapter: "gemini",
    });
    expect(getReplBuiltinCommand("/model")).toEqual({ kind: "model" });
    expect(getReplBuiltinCommand("/model gpt-5")).toEqual({
      kind: "model",
      model: "gpt-5",
    });
    expect(getReplBuiltinCommand("/verbose")).toEqual({ kind: "verbose" });
    expect(getReplBuiltinCommand("/verbose on")).toEqual({ kind: "verbose", value: true });
    expect(getReplBuiltinCommand("/verbose off")).toEqual({ kind: "verbose", value: false });
    expect(getReplBuiltinCommand("/verbose maybe")).toEqual({ kind: "verbose" });
  });

  it("treats invalid runtime builtin arguments as builtin help-style routes", () => {
    expect(getReplBuiltinCommand("/adapter invalid")).toEqual({ kind: "adapter" });
  });

  it("leaves normal prompts untouched", () => {
    expect(getReplBuiltinCommand("help")).toBeNull();
    expect(getReplBuiltinCommand("/help me debug this")).toBeNull();
    expect(getReplBuiltinCommand("summarize current repo status")).toBeNull();
  });

  it("moves the login selector with wrap-around behavior", () => {
    expect(getNextLoginSelectionIndex(0, "up", 2)).toBe(1);
    expect(getNextLoginSelectionIndex(1, "down", 2)).toBe(0);
    expect(getNextLoginSelectionIndex(0, "down", 2)).toBe(1);
  });

  it("moves generic selectors with wrap-around behavior", () => {
    expect(getNextSelectionIndex(0, "up", 2)).toBe(1);
    expect(getNextSelectionIndex(1, "down", 2)).toBe(0);
    expect(getNextSelectionIndex(0, "down", 2)).toBe(1);
  });

  it("maps adapters to the expected login commands", () => {
    expect(getLoginCommandSpec("codex")).toEqual({
      command: "codex",
      args: ["login"],
    });
    expect(getLoginCommandSpec("gemini")).toEqual({
      command: "gemini",
      args: [],
    });
  });

  it("applies /session, /adapter, /model, and /verbose builtin effects", () => {
    const initialState = {
      adapter: "codex" as const,
      model: "gpt-5",
      executionMode: "stub" as const,
      verbose: false,
    };

    const sessionResult = runReplBuiltinCommand(
      { kind: "session" },
      initialState,
      "repl-session-123",
    );
    expect(sessionResult.shouldExit).toBe(false);
    expect(sessionResult.output).toContain('"sessionId": "repl-session-123"');
    expect(sessionResult.output).toContain('"adapter": "codex"');
    expect(sessionResult.output).toContain('"model": "gpt-5"');
    expect(sessionResult.output).toContain('"executionMode": "stub"');

    const adapterResult = runReplBuiltinCommand(
      { kind: "adapter", adapter: "gemini" },
      initialState,
      "repl-session-123",
    );
    expect(adapterResult.shouldExit).toBe(false);
    expect(adapterResult.nextState.adapter).toBe("gemini");
    expect(adapterResult.output).toContain("REPL 어댑터가 gemini(으)로 설정되었습니다.");

    const modelResult = runReplBuiltinCommand(
      { kind: "model", model: "gemini-2.5-pro" },
      adapterResult.nextState,
      "repl-session-123",
    );
    expect(modelResult.shouldExit).toBe(false);
    expect(modelResult.nextState.model).toBe("gemini-2.5-pro");
    expect(modelResult.output).toContain("REPL 모델이 gemini-2.5-pro(으)로 설정되었습니다.");

    const verboseResult = runReplBuiltinCommand(
      { kind: "verbose", value: true },
      modelResult.nextState,
      "repl-session-123",
    );
    expect(verboseResult.shouldExit).toBe(false);
    expect(verboseResult.nextState.verbose).toBe(true);
    expect(verboseResult.output).toContain("REPL 상세 출력이 true(으)로 설정되었습니다.");
  });

  it("keeps non-interactive guidance for /adapter and /verbose without args", () => {
    const initialState = {
      adapter: "codex" as const,
      executionMode: "stub" as const,
      verbose: false,
    };

    const adapterResult = runReplBuiltinCommand(
      { kind: "adapter" },
      initialState,
      "repl-session-123",
    );
    expect(adapterResult.output).toContain("/adapter codex 또는 /adapter gemini 를 입력해 어댑터를 변경하세요.");

    const verboseResult = runReplBuiltinCommand(
      { kind: "verbose" },
      initialState,
      "repl-session-123",
    );
    expect(verboseResult.output).toContain("/verbose on 또는 /verbose off 를 입력해 상세 출력을 변경하세요.");
  });

  it("tracks source badge emission on first response and source changes", () => {
    const initialState = {
      adapter: "codex" as const,
      model: "gpt-5",
      executionMode: "stub" as const,
      verbose: false,
    };

    expect(getReplSourceBadgeKey(initialState)).toBe("codex::gpt-5::stub");
    expect(shouldEmitReplSourceBadge(initialState, null)).toBe(true);
    expect(shouldEmitReplSourceBadge(initialState, "codex::gpt-5::stub")).toBe(false);
    expect(
      shouldEmitReplSourceBadge(
        { ...initialState, adapter: "gemini" as const },
        "codex::gpt-5::stub",
      ),
    ).toBe(true);
    expect(
      shouldEmitReplSourceBadge(
        { ...initialState, model: "gpt-5.1" },
        "codex::gpt-5::stub",
      ),
    ).toBe(true);
    expect(
      shouldEmitReplSourceBadge(
        { ...initialState, executionMode: "real" as const },
        "codex::gpt-5::stub",
      ),
    ).toBe(true);
  });

  it("builds the repl prompt label from the current source", () => {
    expect(
      getReplPromptLabel({
        adapter: "codex",
        model: "gpt-5",
        executionMode: "stub",
        verbose: false,
      }),
    ).toBe("detoks[codex:gpt-5]> ");

    expect(
      getReplPromptLabel({
        adapter: "gemini",
        executionMode: "real",
        verbose: true,
      }),
    ).toBe("detoks[gemini]> ");
  });

  it("tracks source badge emission on first response and source changes", () => {
    const initialState = {
      adapter: "codex" as const,
      model: "gpt-5",
      executionMode: "stub" as const,
      verbose: false,
    };

    expect(getReplSourceBadgeKey(initialState)).toBe("codex::gpt-5::stub");
    expect(shouldEmitReplSourceBadge(initialState, null)).toBe(true);
    expect(shouldEmitReplSourceBadge(initialState, "codex::gpt-5::stub")).toBe(false);
    expect(
      shouldEmitReplSourceBadge(
        { ...initialState, adapter: "gemini" as const },
        "codex::gpt-5::stub",
      ),
    ).toBe(true);
    expect(
      shouldEmitReplSourceBadge(
        { ...initialState, model: "gpt-5.1" },
        "codex::gpt-5::stub",
      ),
    ).toBe(true);
    expect(
      shouldEmitReplSourceBadge(
        { ...initialState, executionMode: "real" as const },
        "codex::gpt-5::stub",
      ),
    ).toBe(true);
  });

  it("builds the repl prompt label from the current source", () => {
    expect(
      getReplPromptLabel({
        adapter: "codex",
        model: "gpt-5",
        executionMode: "stub",
        verbose: false,
      }),
    ).toBe("detoks[codex:gpt-5]> ");

    expect(
      getReplPromptLabel({
        adapter: "gemini",
        executionMode: "real",
        verbose: true,
      }),
    ).toBe("detoks[gemini]> ");
  });
});

describe("resolveReplSessionId", () => {
  it("prefers an explicit session id", async () => {
    await expect(
      resolveReplSessionId({
        explicitSessionId: "repl-explicit-session",
        lastSession,
        canPromptForResume: true,
        hasStoredSession: async () => true,
        allocateSessionId: async () => "repl-new-session",
        promptToResume: async () => true,
        updateLastResumed: async () => undefined,
      }),
    ).resolves.toBe("repl-explicit-session");
  });

  it("allocates a new session when the user declines resume", async () => {
    await expect(
      resolveReplSessionId({
        explicitSessionId: undefined,
        lastSession,
        canPromptForResume: true,
        hasStoredSession: async () => true,
        allocateSessionId: async () => "repl-new-session",
        promptToResume: async () => false,
        updateLastResumed: async () => undefined,
      }),
    ).resolves.toBe("repl-new-session");
  });
});
