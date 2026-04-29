import { afterEach, describe, expect, it, vi } from "vitest";
import { runCheckpointRestoreCommand } from "../../../../src/cli/commands/checkpoint-restore.js";
import { SessionStateManager } from "../../../../src/core/state/SessionStateManager.js";

describe("runCheckpointRestoreCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("rejects checkpoint ids that cannot identify a non-empty session id", async () => {
    vi.spyOn(SessionStateManager, "loadCheckpoint").mockResolvedValue({
      id: "_checkpoint_001",
      title: "Invalid checkpoint",
      task_id: "task_001",
      summary: "Invalid",
      changed_files: [],
      next_action: "None",
      created_at: "2026-04-27T00:00:00.000Z",
    } as any);

    await expect(runCheckpointRestoreCommand("_checkpoint_001")).resolves.toEqual({
      ok: false,
      mode: "checkpoint-restore",
      sessionId: "unknown",
      checkpointId: "_checkpoint_001",
      restored: false,
      mutatesState: false,
      message: "체크포인트 ID _checkpoint_001이(가) <세션-id>_checkpoint_<체크포인트-id> 형식이 아닙니다.",
    });
  });

  it("returns an explicit not-found contract when the target session is missing", async () => {
    vi.spyOn(SessionStateManager, "loadCheckpoint").mockResolvedValue({
      id: "session_restore_checkpoint_001",
      title: "체크포인트",
      task_id: "task_001",
      summary: "체크포인트 요약",
      changed_files: ["src/cli/parse.ts"],
      next_action: "작업 기록을 복원하세요",
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
      message: "체크포인트 session_restore_checkpoint_001의 대상 세션 session_restore를 찾지 못했습니다.",
    });
  });

  it("truncates task history to the restored checkpoint", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T12:34:56.000Z"));

    vi.spyOn(SessionStateManager, "loadCheckpoint").mockResolvedValue({
      id: "session_restore_checkpoint_001",
      title: "체크포인트",
      task_id: "task_001",
      summary: "체크포인트 요약",
      changed_files: ["src/cli/parse.ts"],
      next_action: "작업 기록을 복원하세요",
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
      next_action: "나중에 이어서 진행하세요",
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
      message: "세션 session_restore를 체크포인트 session_restore_checkpoint_001 시점으로 복원했습니다.",
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
      next_action: "나중에 이어서 진행하세요",
      updated_at: "2026-04-27T12:34:56.000Z",
    });
  });
});
