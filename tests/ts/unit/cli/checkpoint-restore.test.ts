import { afterEach, describe, expect, it, vi } from "vitest";
import { runCheckpointRestoreCommand } from "../../../../src/cli/commands/checkpoint-restore.js";
import { SessionStateManager } from "../../../../src/core/state/SessionStateManager.js";

describe("runCheckpointRestoreCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("returns an explicit not-found contract when the target session is missing", async () => {
    vi.spyOn(SessionStateManager, "loadCheckpoint").mockResolvedValue({
      id: "session_restore_checkpoint_001",
      title: "Checkpoint",
      task_id: "task_001",
      summary: "Checkpoint summary",
      changed_files: ["src/cli/parse.ts"],
      next_action: "Restore task history",
      created_at: "2026-04-27T00:00:00.000Z",
    });
    vi.spyOn(SessionStateManager, "sessionExists").mockResolvedValue(false);

    await expect(
      runCheckpointRestoreCommand("session_restore_checkpoint_001"),
    ).resolves.toEqual({
      ok: false,
      mode: "checkpoint-restore",
      sessionId: "session_restore",
      checkpointId: "session_restore_checkpoint_001",
      restored: false,
      mutatesState: false,
      message:
        "Target session session_restore for checkpoint session_restore_checkpoint_001 was not found.",
    });
  });

  it("truncates task history to the restored checkpoint", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T12:34:56.000Z"));

    vi.spyOn(SessionStateManager, "loadCheckpoint").mockResolvedValue({
      id: "session_restore_checkpoint_001",
      title: "Checkpoint",
      task_id: "task_001",
      summary: "Checkpoint summary",
      changed_files: ["src/cli/parse.ts"],
      next_action: "Restore task history",
      created_at: "2026-04-27T00:00:00.000Z",
    });
    vi.spyOn(SessionStateManager, "sessionExists").mockResolvedValue(true);
    vi.spyOn(SessionStateManager, "loadSession").mockResolvedValue({
      shared_context: {
        session_id: "session_restore",
      },
      task_results: {
        task_001: {
          task_id: "task_001",
          success: true,
          summary: "First",
          raw_output: "first",
        },
        task_002: {
          task_id: "task_002",
          success: true,
          summary: "Second",
          raw_output: "second",
        },
      },
      current_task_id: "task_002",
      completed_task_ids: ["task_001", "task_002"],
      next_action: "Continue later",
      updated_at: "2026-04-27T00:00:00.000Z",
    });
    const saveSpy = vi
      .spyOn(SessionStateManager, "saveSession")
      .mockResolvedValue(undefined);

    await expect(
      runCheckpointRestoreCommand("session_restore_checkpoint_001"),
    ).resolves.toEqual({
      ok: true,
      mode: "checkpoint-restore",
      sessionId: "session_restore",
      checkpointId: "session_restore_checkpoint_001",
      restored: true,
      mutatesState: true,
      message:
        "Session session_restore restored to checkpoint session_restore_checkpoint_001.",
    });

    expect(saveSpy).toHaveBeenCalledWith({
      shared_context: {
        session_id: "session_restore",
      },
      task_results: {
        task_001: {
          task_id: "task_001",
          success: true,
          summary: "First",
          raw_output: "first",
        },
      },
      current_task_id: null,
      completed_task_ids: ["task_001"],
      next_action: "Continue later",
      updated_at: "2026-04-27T12:34:56.000Z",
    });
  });
});
