import { afterEach, describe, expect, it, vi } from "vitest";
import { runSessionContinueCommand } from "../../../../src/cli/commands/session-continue.js";
import { SessionStateManager } from "../../../../src/core/state/SessionStateManager.js";
import type { NormalizedCliRequest } from "../../../../src/cli/types.js";

const baseRequest: NormalizedCliRequest = {
  mode: "run",
  adapter: "codex",
  executionMode: "stub",
  verbose: false,
  userRequest: {
    raw_input: "[session continue]",
    session_id: "session_resume",
    cwd: "/tmp",
    timestamp: "2026-04-27T00:00:00.000Z",
  },
};

describe("runSessionContinueCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an explicit not-found contract when the session is missing", async () => {
    vi.spyOn(SessionStateManager, "sessionExists").mockResolvedValue(false);

    await expect(runSessionContinueCommand(baseRequest)).resolves.toEqual({
      ok: true,
      mode: "session-continue",
      sessionId: "session_resume",
      canContinue: false,
      resumeStarted: false,
      mutatesState: false,
      resumeOverview: null,
      message: "세션 session_resume를 찾지 못했습니다. 다시 시작하지 않았습니다.",
      nextAction: null,
    });
  });

  it("returns an explicit contract when the session has no stored raw input", async () => {
    vi.spyOn(SessionStateManager, "sessionExists").mockResolvedValue(true);
    vi.spyOn(SessionStateManager, "loadSession").mockResolvedValue({
      shared_context: {
        session_id: "session_resume",
      },
      task_results: {},
      current_task_id: "t1",
      completed_task_ids: [],
      next_action: "원본 입력을 복구하세요",
      updated_at: "2026-04-27T00:00:00.000Z",
    });

    await expect(runSessionContinueCommand(baseRequest)).resolves.toEqual({
      ok: true,
      mode: "session-continue",
      sessionId: "session_resume",
      canContinue: false,
      resumeStarted: false,
      mutatesState: false,
      resumeOverview: {
        summary: null,
        nextAction: "원본 입력을 복구하세요",
        currentTaskId: "t1",
        completedTaskCount: 0,
        taskResultCount: 0,
        updatedAt: "2026-04-27T00:00:00.000Z",
      },
      message: "세션 session_resume에 저장된 raw_input이 없습니다. 다시 시작하지 않았습니다.",
      nextAction: "원본 입력을 복구하세요",
    });
  });

  it("replays the stored raw input and returns resume execution status", async () => {
    vi.spyOn(SessionStateManager, "sessionExists").mockResolvedValue(true);
    vi.spyOn(SessionStateManager, "loadSession").mockResolvedValue({
      shared_context: {
        session_id: "session_resume",
        raw_input: "Find the auth module. Test the auth module.",
      },
      task_results: {
        t1: {
          task_id: "t1",
          success: true,
          summary: "previous raw",
          raw_output: "previous raw",
        },
      },
      current_task_id: "t2",
      completed_task_ids: ["t1"],
      next_action: "남은 작업을 이어서 진행하세요",
      updated_at: "2026-04-27T00:00:00.000Z",
    });
    const executeRequest = vi.fn().mockResolvedValue({
      ok: true,
      mode: "run",
      adapter: "codex",
      summary: "2개 작업을 모두 완료했습니다",
      nextAction: "파이프라인이 완료되었습니다.",
      stages: [],
      rawOutput: "[stub:codex] [EXECUTE] remaining task",
      sessionId: "session_resume",
      taskRecords: [
        { taskId: "t1", status: "completed", rawOutput: "previous raw" },
        { taskId: "t2", status: "completed", rawOutput: "[stub:codex] [EXECUTE] remaining task" },
      ],
      compiledPrompt: "find the auth module. test the auth module.",
      role2Handoff: "Find the auth module. Test the auth module.",
      promptLanguage: "en",
      promptInferenceTimeSec: 0,
      promptValidationErrors: [],
      promptRepairActions: ["compressed_with_kompress"],
    });
    const onResumeOverview = vi.fn();

    await expect(
      runSessionContinueCommand(baseRequest, executeRequest, {
        onResumeOverview,
      }),
    ).resolves.toEqual({
      ok: true,
      mode: "session-continue",
      sessionId: "session_resume",
      canContinue: true,
      resumeStarted: true,
      mutatesState: true,
      resumeOverview: {
        summary: "previous raw",
        nextAction: "남은 작업을 이어서 진행하세요",
        currentTaskId: "t2",
        completedTaskCount: 1,
        taskResultCount: 1,
        updatedAt: "2026-04-27T00:00:00.000Z",
      },
      message: "세션 session_resume를 저장된 raw_input으로 다시 시작했습니다.",
      adapter: "codex",
      summary: "2개 작업을 모두 완료했습니다",
      nextAction: "파이프라인이 완료되었습니다.",
      taskRecords: [
        { taskId: "t1", status: "completed", rawOutput: "previous raw" },
        { taskId: "t2", status: "completed", rawOutput: "[stub:codex] [EXECUTE] remaining task" },
      ],
      rawOutput: "[stub:codex] [EXECUTE] remaining task",
      compiledPrompt: "find the auth module. test the auth module.",
      role2Handoff: "Find the auth module. Test the auth module.",
      promptLanguage: "en",
      promptInferenceTimeSec: 0,
      promptValidationErrors: [],
      promptRepairActions: ["compressed_with_kompress"],
    });

    expect(onResumeOverview).toHaveBeenCalledWith({
      summary: "previous raw",
      nextAction: "남은 작업을 이어서 진행하세요",
      currentTaskId: "t2",
      completedTaskCount: 1,
      taskResultCount: 1,
      updatedAt: "2026-04-27T00:00:00.000Z",
    });
    expect(executeRequest).toHaveBeenCalledWith({
      ...baseRequest,
      userRequest: {
        ...baseRequest.userRequest,
        raw_input: "Find the auth module. Test the auth module.",
        session_id: "session_resume",
      },
    });
  });
});
