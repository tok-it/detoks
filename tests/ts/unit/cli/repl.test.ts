import { describe, expect, it, vi } from "vitest";
import { resolveReplSessionId } from "../../../../src/cli/commands/repl.js";
import type { ReplSession } from "../../../../src/cli/repl/ReplRegistry.js";

const lastSession: ReplSession = {
  project_id: "detoks",
  session_id: "repl-existing-session",
  adapter: "codex",
  execution_mode: "stub",
  created_at: "2026-04-28T00:00:00.000Z",
  last_resumed_at: "2026-04-28T01:23:45.000Z",
};

describe("resolveReplSessionId", () => {
  it("prefers an explicit session id without touching registry helpers", async () => {
    const hasStoredSession = vi.fn(async () => true);
    const allocateSessionId = vi.fn(async () => "repl-new-session");
    const promptToResume = vi.fn(async () => true);
    const updateLastResumed = vi.fn(async () => undefined);

    await expect(
      resolveReplSessionId({
        explicitSessionId: "repl-explicit-session",
        lastSession,
        canPromptForResume: true,
        hasStoredSession,
        allocateSessionId,
        promptToResume,
        updateLastResumed,
      }),
    ).resolves.toBe("repl-explicit-session");

    expect(hasStoredSession).not.toHaveBeenCalled();
    expect(allocateSessionId).not.toHaveBeenCalled();
    expect(promptToResume).not.toHaveBeenCalled();
    expect(updateLastResumed).not.toHaveBeenCalled();
  });

  it("prompts in interactive mode and allocates a new session when the user declines", async () => {
    const hasStoredSession = vi.fn(async () => true);
    const allocateSessionId = vi.fn(async () => "repl-new-session");
    const promptToResume = vi.fn(async () => false);
    const updateLastResumed = vi.fn(async () => undefined);

    await expect(
      resolveReplSessionId({
        explicitSessionId: undefined,
        lastSession,
        canPromptForResume: true,
        hasStoredSession,
        allocateSessionId,
        promptToResume,
        updateLastResumed,
      }),
    ).resolves.toBe("repl-new-session");

    expect(hasStoredSession).toHaveBeenCalledWith("repl-existing-session");
    expect(promptToResume).toHaveBeenCalledWith(lastSession);
    expect(allocateSessionId).toHaveBeenCalledOnce();
    expect(updateLastResumed).not.toHaveBeenCalled();
  });

  it("prompts in interactive mode and resumes when the user accepts", async () => {
    const hasStoredSession = vi.fn(async () => true);
    const allocateSessionId = vi.fn(async () => "repl-new-session");
    const promptToResume = vi.fn(async () => true);
    const updateLastResumed = vi.fn(async () => undefined);

    await expect(
      resolveReplSessionId({
        explicitSessionId: undefined,
        lastSession,
        canPromptForResume: true,
        hasStoredSession,
        allocateSessionId,
        promptToResume,
        updateLastResumed,
      }),
    ).resolves.toBe("repl-existing-session");

    expect(promptToResume).toHaveBeenCalledWith(lastSession);
    expect(updateLastResumed).toHaveBeenCalledOnce();
    expect(allocateSessionId).not.toHaveBeenCalled();
  });

  it("keeps non-interactive mode on automatic resume behavior", async () => {
    const hasStoredSession = vi.fn(async () => true);
    const allocateSessionId = vi.fn(async () => "repl-new-session");
    const promptToResume = vi.fn(async () => true);
    const updateLastResumed = vi.fn(async () => undefined);

    await expect(
      resolveReplSessionId({
        explicitSessionId: undefined,
        lastSession,
        canPromptForResume: false,
        hasStoredSession,
        allocateSessionId,
        promptToResume,
        updateLastResumed,
      }),
    ).resolves.toBe("repl-existing-session");

    expect(promptToResume).not.toHaveBeenCalled();
    expect(updateLastResumed).toHaveBeenCalledOnce();
    expect(allocateSessionId).not.toHaveBeenCalled();
  });
});
