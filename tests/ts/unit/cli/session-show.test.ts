import { afterEach, describe, expect, it, vi } from "vitest";
import { runSessionShowCommand } from "../../../../src/cli/commands/session-show.js";
import { SessionStateManager } from "../../../../src/core/state/SessionStateManager.js";

describe("runSessionShowCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an explicit not-found contract when the session is missing", async () => {
    vi.spyOn(SessionStateManager, "sessionExists").mockResolvedValue(false);

    await expect(runSessionShowCommand("session_missing")).resolves.toEqual({
      ok: true,
      mode: "session-show",
      sessionId: "session_missing",
      hasSession: false,
      mutatesState: false,
      message: "세션 session_missing를 찾지 못했습니다.",
      overview: null,
      taskResults: [],
    });
  });

  it("returns a readable overview and task log entries for an existing session", async () => {
    vi.spyOn(SessionStateManager, "sessionExists").mockResolvedValue(true);
    vi.spyOn(SessionStateManager, "loadSession").mockResolvedValue({
      shared_context: {
        session_id: "session_show",
      },
      task_results: {
        t1: {
          task_id: "t1",
          success: true,
          summary: "첫 번째 작업 완료",
          raw_output: "[stub:codex] first output",
        },
        t2: {
          task_id: "t2",
          success: false,
          summary: "두 번째 작업 실패",
          raw_output: "[stub:codex] second output",
        },
      },
      current_task_id: "t2",
      completed_task_ids: ["t1"],
      next_action: "다음 작업을 진행하세요",
      updated_at: "2026-04-27T00:00:00.000Z",
    });

    await expect(runSessionShowCommand("session_show")).resolves.toEqual({
      ok: true,
      mode: "session-show",
      sessionId: "session_show",
      hasSession: true,
      mutatesState: false,
      message: "세션 session_show의 저장된 작업 결과를 불러왔습니다.",
      overview: {
        summary: "첫 번째 작업 완료",
        nextAction: "다음 작업을 진행하세요",
        currentTaskId: "t2",
        completedTaskCount: 1,
        taskResultCount: 2,
        updatedAt: "2026-04-27T00:00:00.000Z",
      },
      taskResults: [
        {
          taskId: "t1",
          success: true,
          summary: "첫 번째 작업 완료",
          rawOutputPreview: "[stub:codex] first output",
        },
        {
          taskId: "t2",
          success: false,
          summary: "두 번째 작업 실패",
          rawOutputPreview: "[stub:codex] second output",
        },
      ],
    });
  });

  it("includes full raw outputs when requested", async () => {
    vi.spyOn(SessionStateManager, "sessionExists").mockResolvedValue(true);
    vi.spyOn(SessionStateManager, "loadSession").mockResolvedValue({
      shared_context: {
        session_id: "session_show_verbose",
      },
      task_results: {
        t1: {
          task_id: "t1",
          success: true,
          summary: "첫 번째 작업 완료",
          raw_output: "[stub:codex] first output",
        },
      },
      completed_task_ids: ["t1"],
      updated_at: "2026-04-27T00:00:00.000Z",
    });

    const result = await runSessionShowCommand("session_show_verbose", {
      includeRawOutput: true,
    });

    expect(result).toEqual({
      ok: true,
      mode: "session-show",
      sessionId: "session_show_verbose",
      hasSession: true,
      mutatesState: false,
      message: "세션 session_show_verbose의 저장된 작업 결과를 불러왔습니다.",
      overview: {
        summary: "첫 번째 작업 완료",
        nextAction: null,
        currentTaskId: null,
        completedTaskCount: 1,
        taskResultCount: 1,
        updatedAt: "2026-04-27T00:00:00.000Z",
      },
      taskResults: [
        {
          taskId: "t1",
          success: true,
          summary: "첫 번째 작업 완료",
          rawOutputPreview: "[stub:codex] first output",
          rawOutput: "[stub:codex] first output",
        },
      ],
    });
  });
});
