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
      title: "파싱 UX 이후",
      task_id: "task_001",
      summary: "체크포인트 요약",
      changed_files: ["src/cli/parse.ts"],
      next_action: "파싱 테스트를 실행하세요",
      created_at: "2026-04-27T00:00:00.000Z",
    });

    const result = await runCheckpointShowCommand("session_full_checkpoint_001");

    expect(result).toEqual({
      ok: true,
      mode: "checkpoint-show",
      mutatesState: false,
      message: "체크포인트 session_full_checkpoint_001를 불러왔습니다.",
      checkpoint: {
        id: "session_full_checkpoint_001",
        title: "파싱 UX 이후",
        taskId: "task_001",
        createdAt: "2026-04-27T00:00:00.000Z",
        changedFiles: ["src/cli/parse.ts"],
        nextAction: "파싱 테스트를 실행하세요",
      },
    });
    expect(result).not.toHaveProperty("promptLanguage");
    expect(result).not.toHaveProperty("promptInferenceTimeSec");
    expect(result).not.toHaveProperty("promptValidationErrors");
    expect(result).not.toHaveProperty("promptRepairActions");
  });
});
