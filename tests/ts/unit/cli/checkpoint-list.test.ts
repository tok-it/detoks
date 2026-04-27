import { afterEach, describe, expect, it, vi } from "vitest";
import { runCheckpointListCommand } from "../../../../src/cli/commands/checkpoint-list.js";
import { SessionStateManager } from "../../../../src/core/state/SessionStateManager.js";

describe("runCheckpointListCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an explicit empty contract when a session has no checkpoints", async () => {
    vi.spyOn(SessionStateManager, "listCheckpoints").mockResolvedValue([]);

    const result = await runCheckpointListCommand("session_empty");

    expect(result).toEqual({
      ok: true,
      mode: "checkpoint-list",
      sessionId: "session_empty",
      mutatesState: false,
      hasCheckpoints: false,
      checkpointCount: 0,
      message: "No checkpoints found for session session_empty.",
      checkpoints: [],
    });
    expect(result).not.toHaveProperty("promptLanguage");
    expect(result).not.toHaveProperty("promptInferenceTimeSec");
    expect(result).not.toHaveProperty("promptValidationErrors");
    expect(result).not.toHaveProperty("promptRepairActions");
  });

  it("returns checkpoint metadata without mutating session state", async () => {
    vi.spyOn(SessionStateManager, "listCheckpoints").mockResolvedValue([
      {
        id: "session_full_checkpoint_001",
        title: "After parse UX",
        task_id: "task_001",
        summary: "Checkpoint summary",
        changed_files: ["src/cli/parse.ts"],
        next_action: "Run parse tests",
        created_at: "2026-04-27T00:00:00.000Z",
      },
    ]);

    const result = await runCheckpointListCommand("session_full");

    expect(result).toEqual({
      ok: true,
      mode: "checkpoint-list",
      sessionId: "session_full",
      mutatesState: false,
      hasCheckpoints: true,
      checkpointCount: 1,
      message: "1 checkpoint(s) found for session session_full.",
      checkpoints: [
        {
          id: "session_full_checkpoint_001",
          title: "After parse UX",
          taskId: "task_001",
          createdAt: "2026-04-27T00:00:00.000Z",
          changedFiles: ["src/cli/parse.ts"],
          nextAction: "Run parse tests",
        },
      ],
    });
    expect(result).not.toHaveProperty("promptLanguage");
    expect(result).not.toHaveProperty("promptInferenceTimeSec");
    expect(result).not.toHaveProperty("promptValidationErrors");
    expect(result).not.toHaveProperty("promptRepairActions");
  });
});
