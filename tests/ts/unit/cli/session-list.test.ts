import { afterEach, describe, expect, it, vi } from "vitest";
import { runSessionListCommand } from "../../../../src/cli/commands/session-list.js";
import { SessionStateManager } from "../../../../src/core/state/SessionStateManager.js";

describe("runSessionListCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an explicit empty contract without prompt runtime metadata", async () => {
    vi.spyOn(SessionStateManager, "listSessions").mockResolvedValue([]);

    const result = await runSessionListCommand();

    expect(result).toEqual({
      ok: true,
      mode: "session-list",
      mutatesState: false,
      hasSessions: false,
      sessionCount: 0,
      message: "No sessions found.",
      sessions: [],
    });
    expect(result).not.toHaveProperty("promptLanguage");
    expect(result).not.toHaveProperty("promptInferenceTimeSec");
    expect(result).not.toHaveProperty("promptValidationErrors");
    expect(result).not.toHaveProperty("promptRepairActions");
  });

  it("returns saved session metadata without prompt runtime metadata", async () => {
    vi.spyOn(SessionStateManager, "listSessions").mockResolvedValue([
      {
        id: "session_full",
        updatedAt: "2026-04-27T00:00:00.000Z",
        currentTaskId: "task_001",
        completedTaskCount: 1,
        taskResultCount: 2,
        failedTaskCount: 1,
        checkpointCount: 3,
        nextAction: "Review saved session",
      },
    ]);

    const result = await runSessionListCommand();

    expect(result).toEqual({
      ok: true,
      mode: "session-list",
      mutatesState: false,
      hasSessions: true,
      sessionCount: 1,
      message: "1 session(s) found.",
      sessions: [
        {
          id: "session_full",
          updatedAt: "2026-04-27T00:00:00.000Z",
          currentTaskId: "task_001",
          completedTaskCount: 1,
          taskResultCount: 2,
          nextAction: "Review saved session",
        },
      ],
    });
    expect(result).not.toHaveProperty("promptLanguage");
    expect(result).not.toHaveProperty("promptInferenceTimeSec");
    expect(result).not.toHaveProperty("promptValidationErrors");
    expect(result).not.toHaveProperty("promptRepairActions");
  });
});
