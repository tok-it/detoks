import { afterEach, describe, expect, it, vi } from "vitest";
import { runSessionForkCommand } from "../../../../src/cli/commands/session-fork.js";
import { SessionStateManager } from "../../../../src/core/state/SessionStateManager.js";

describe("runSessionForkCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not fork when the source session is missing", async () => {
    vi.spyOn(SessionStateManager, "sessionExists").mockResolvedValue(false);

    await expect(runSessionForkCommand("missing", "new_session")).resolves.toEqual({
      ok: false,
      mode: "session-fork",
      sourceSessionId: "missing",
      newSessionId: "new_session",
      forked: false,
      mutatesState: false,
      message: "Source session missing was not found. No fork was created.",
      nextAction: null,
    });
  });

  it("prevents overwriting an existing target session", async () => {
    vi.spyOn(SessionStateManager, "sessionExists")
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);

    await expect(runSessionForkCommand("source", "existing")).resolves.toEqual({
      ok: false,
      mode: "session-fork",
      sourceSessionId: "source",
      newSessionId: "existing",
      forked: false,
      mutatesState: false,
      message: "Session existing already exists. No fork was created.",
      nextAction: null,
    });
  });

  it("forks a source session to a new session id", async () => {
    vi.spyOn(SessionStateManager, "sessionExists")
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    vi.spyOn(SessionStateManager, "forkSession").mockResolvedValue({
      shared_context: { session_id: "forked" },
      task_results: {},
      current_task_id: "task_001",
      completed_task_ids: [],
      next_action: "Review fork",
      updated_at: "2026-04-27T00:00:00.000Z",
    });

    await expect(runSessionForkCommand("source", "forked")).resolves.toEqual({
      ok: true,
      mode: "session-fork",
      sourceSessionId: "source",
      newSessionId: "forked",
      forked: true,
      mutatesState: true,
      message: "Session source was forked to forked.",
      nextAction: "Review fork",
    });
  });
});
