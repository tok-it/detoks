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
      message: "세션 session_empty에서 체크포인트를 찾지 못했습니다.",
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
        title: "파싱 UX 이후",
        task_id: "task_001",
        summary: "체크포인트 요약",
        changed_files: ["src/cli/parse.ts"],
        next_action: "파싱 테스트를 실행하세요",
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
      message: "세션 session_full에서 체크포인트 1개를 찾았습니다.",
      checkpoints: [
          {
            id: "session_full_checkpoint_001",
            title: "파싱 UX 이후",
            taskId: "task_001",
            createdAt: "2026-04-27T00:00:00.000Z",
            changedFiles: ["src/cli/parse.ts"],
            nextAction: "파싱 테스트를 실행하세요",
          },
        ],
      });
    expect(result).not.toHaveProperty("promptLanguage");
    expect(result).not.toHaveProperty("promptInferenceTimeSec");
    expect(result).not.toHaveProperty("promptValidationErrors");
    expect(result).not.toHaveProperty("promptRepairActions");
  });
});
