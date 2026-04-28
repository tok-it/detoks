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
      message: "Session session_resume was not found. No resume was started.",
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
      next_action: "Recover source input",
      updated_at: "2026-04-27T00:00:00.000Z",
    });

    await expect(runSessionContinueCommand(baseRequest)).resolves.toEqual({
      ok: true,
      mode: "session-continue",
      sessionId: "session_resume",
      canContinue: false,
      resumeStarted: false,
      mutatesState: false,
      message:
        "Session session_resume does not have a stored raw_input. No resume was started.",
      nextAction: "Recover source input",
    });
  });

  it("replays the stored raw input and returns resume execution status", async () => {
    vi.spyOn(SessionStateManager, "sessionExists").mockResolvedValue(true);
    vi.spyOn(SessionStateManager, "loadSession").mockResolvedValue({
      shared_context: {
        session_id: "session_resume",
        raw_input: "Find the auth module. Test the auth module.",
      },
      task_results: {},
      current_task_id: "t2",
      completed_task_ids: ["t1"],
      next_action: "Resume remaining work",
      updated_at: "2026-04-27T00:00:00.000Z",
    });
    const executeRequest = vi.fn().mockResolvedValue({
      ok: true,
      mode: "run",
      adapter: "codex",
      summary: "All 2 task(s) completed",
      nextAction: "Pipeline complete",
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

    await expect(
      runSessionContinueCommand(baseRequest, executeRequest),
    ).resolves.toEqual({
      ok: true,
      mode: "session-continue",
      sessionId: "session_resume",
      canContinue: true,
      resumeStarted: true,
      mutatesState: true,
      message: "Session session_resume resumed using stored raw_input.",
      adapter: "codex",
      summary: "All 2 task(s) completed",
      nextAction: "Pipeline complete",
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
