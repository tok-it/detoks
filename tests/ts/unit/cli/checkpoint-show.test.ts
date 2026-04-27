import { afterEach, describe, expect, it, vi } from "vitest";
import { runCheckpointShowCommand } from "../../../../src/cli/commands/checkpoint-show.js";
import { SessionStateManager } from "../../../../src/core/state/SessionStateManager.js";

describe("runCheckpointShowCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns checkpoint metadata without mutating session state", async () => {
    vi.spyOn(SessionStateManager, "loadCheckpoint").mockResolvedValue({
      id: "session_full_checkpoint_001",
      title: "After parse UX",
      task_id: "task_001",
      summary: "Checkpoint summary",
      changed_files: ["src/cli/parse.ts"],
      next_action: "Run parse tests",
      created_at: "2026-04-27T00:00:00.000Z",
    });

    await expect(runCheckpointShowCommand("session_full_checkpoint_001")).resolves.toEqual({
      ok: true,
      mode: "checkpoint-show",
      checkpoint: {
        id: "session_full_checkpoint_001",
        title: "After parse UX",
        taskId: "task_001",
        createdAt: "2026-04-27T00:00:00.000Z",
        changedFiles: ["src/cli/parse.ts"],
        nextAction: "Run parse tests",
      },
    });
  });
});
