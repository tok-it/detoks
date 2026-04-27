import { afterEach, describe, expect, it, vi } from "vitest";
import { runCheckpointListCommand } from "../../../../src/cli/commands/checkpoint-list.js";
import { SessionStateManager } from "../../../../src/core/state/SessionStateManager.js";

describe("runCheckpointListCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an explicit empty contract when a session has no checkpoints", async () => {
    vi.spyOn(SessionStateManager, "listCheckpoints").mockResolvedValue([]);

    await expect(runCheckpointListCommand("session_empty")).resolves.toEqual({
      ok: true,
      mode: "checkpoint-list",
      sessionId: "session_empty",
      hasCheckpoints: false,
      checkpointCount: 0,
      message: "No checkpoints found for session session_empty.",
      checkpoints: [],
    });
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

    await expect(runCheckpointListCommand("session_full")).resolves.toEqual({
      ok: true,
      mode: "checkpoint-list",
      sessionId: "session_full",
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
  });
});
