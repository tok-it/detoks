import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { orchestratePipeline } from "../../../../../src/core/pipeline/orchestrator.js";
import { executeWithAdapter } from "../../../../../src/core/executor/execute.js";
import { SessionStateManager } from "../../../../../src/core/state/SessionStateManager.js";

vi.mock("../../../../../src/core/executor/execute.js", async () => {
  const actual = await vi.importActual<typeof import("../../../../../src/core/executor/execute.js")>(
    "../../../../../src/core/executor/execute.js",
  );

  return {
    ...actual,
    executeWithAdapter: vi.fn(actual.executeWithAdapter),
  };
});

const executeWithAdapterMock = vi.mocked(executeWithAdapter);

describe("orchestratePipeline", () => {
  beforeEach(() => {
    executeWithAdapterMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("executes task graph and returns structured result", async () => {
    const result = await orchestratePipeline({
      mode: "run",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      userRequest: {
        raw_input: "hello detoks",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("run");
    expect(result.adapter).toBe("codex");
    expect(result.summary).toBe("All 1 task(s) completed");
    expect(result.stages).toHaveLength(5);
    expect(result.stages[0]!.status).toBe("completed");
    expect(result.sessionId).toBeTypeOf("string");
    expect(result.taskRecords).toHaveLength(1);
    expect(result.taskRecords[0]!.status).toBe("completed");
    expect(result.rawOutput).toContain("[stub:codex]");
    expect(result.compiledPrompt).toBe("hello detoks");
    expect(result.role2Handoff).toBe(result.compiledPrompt);
    expect(result.promptLanguage).toBe("en");
    expect(result.promptInferenceTimeSec).toBe(0);
    expect(result.promptValidationErrors).toEqual([]);
    expect(result.promptRepairActions).toEqual([]);
  });

  it("passes execution mode through to the executor boundary", async () => {
    executeWithAdapterMock.mockResolvedValueOnce({
      ok: true,
      adapter: "codex",
      rawOutput: "[mock-real] codex",
      exitCode: 0,
    });

    const result = await orchestratePipeline({
      mode: "run",
      adapter: "codex",
      executionMode: "real",
      verbose: false,
      userRequest: {
        raw_input: "hello detoks",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.rawOutput).toBe("[mock-real] codex");
    expect(executeWithAdapterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adapter: "codex",
        executionMode: "real",
      }),
    );
  });

  it("persists task type when a task completes successfully", async () => {
    const saveSessionSpy = vi
      .spyOn(SessionStateManager, "saveSession")
      .mockResolvedValue(undefined);

    const result = await orchestratePipeline({
      mode: "run",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      userRequest: {
        raw_input: "Analyze the codebase",
      },
    });

    expect(result.ok).toBe(true);
    expect(saveSessionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        task_results: expect.objectContaining({
          t1: expect.objectContaining({
            task_id: "t1",
            success: true,
            type: "analyze",
          }),
        }),
      }),
    );
  });

  it("persists task type when a task fails or is skipped by dependency failure", async () => {
    const saveSessionSpy = vi
      .spyOn(SessionStateManager, "saveSession")
      .mockResolvedValue(undefined);
    executeWithAdapterMock.mockResolvedValueOnce({
      ok: false,
      adapter: "codex",
      rawOutput: "[mock-failure] t1",
      exitCode: 1,
    });

    const result = await orchestratePipeline({
      mode: "run",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      userRequest: {
        raw_input: "Find the auth module. Test the auth module.",
      },
    });

    expect(result.ok).toBe(false);
    expect(saveSessionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        task_results: expect.objectContaining({
          t1: expect.objectContaining({
            task_id: "t1",
            success: false,
            type: "explore",
          }),
        }),
      }),
    );
    expect(saveSessionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        task_results: expect.objectContaining({
          t2: expect.objectContaining({
            task_id: "t2",
            success: false,
            type: "validate",
          }),
        }),
      }),
    );
  });

  it("returns a structured failure when prompt compilation cannot start translation", async () => {
    const result = await orchestratePipeline({
      mode: "run",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      userRequest: {
        raw_input: "새 파일을 생성해",
        cwd: "/tmp",
      },
      env: {
        LOCAL_LLM_API_BASE: "",
        LOCAL_LLM_MODEL_NAME: "",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.summary).toBe(
      "Prompt compilation failed: LLM client requires LOCAL_LLM_API_BASE",
    );
    expect(result.nextAction).toContain("LOCAL_LLM_API_BASE");
    expect(result.taskRecords).toEqual([]);
    expect(result.rawOutput).toBe("LLM client requires LOCAL_LLM_API_BASE");
    expect(executeWithAdapterMock).not.toHaveBeenCalled();
  });

  it("surfaces Role 1 metadata from prompt compilation on success", async () => {
    const result = await orchestratePipeline({
      mode: "run",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      userRequest: {
        raw_input:
          "Can you please update src/api/user.ts and run npm test -- --runInBand 2 times?",
      },
      compressionImplementation: vi.fn(async (text: string) => ({
        compressed: text.replace(/^Can you please /i, ""),
        compression_ratio: 0.56,
        tokens_saved: 4,
      })),
    });

    expect(result.ok).toBe(true);
    expect(result.compiledPrompt).toBe(
      "Update src/api/user.ts and run npm test -- --runInBand 2 times?",
    );
    expect(result.promptLanguage).toBe("en");
    expect(result.promptInferenceTimeSec).toBe(0);
    expect(result.promptValidationErrors).toEqual([]);
    expect(result.promptRepairActions).toContain("compressed_with_kompress");
  });

  it("bridges Korean input through the local LLM request contract when runtime overrides are provided", async () => {
    const fetchImplementation = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "Create a new file",
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    const result = await orchestratePipeline({
      mode: "run",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      userRequest: {
        raw_input: "새 파일을 생성해",
      },
      env: {
        LM_STUDIO_URL: "http://127.0.0.1:1234/v1",
        LOCAL_LLM_API_KEY: "test-key",
        LOCAL_LLM_MODEL_NAME: "local-model",
        TRANSLATION_MAX_ATTEMPTS: "1",
      },
      fetchImplementation,
    });

    expect(fetchImplementation).toHaveBeenCalledOnce();
    const fetchCalls = fetchImplementation.mock.calls as unknown as Array<
      [string | URL | Request, RequestInit?]
    >;
    expect(fetchCalls[0]?.[0]).toBe("http://127.0.0.1:1234/v1/chat/completions");
    expect(fetchCalls[0]?.[1]?.headers).toMatchObject({
      authorization: "Bearer test-key",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(fetchCalls[0]?.[1]?.body))).toMatchObject({
      model: "local-model",
      temperature: expect.any(Number),
      messages: [
        expect.objectContaining({ role: "system" }),
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("새 파일을 생성해"),
        }),
      ],
    });
    expect(result).toMatchObject({
      ok: true,
      summary: "All 1 task(s) completed",
      nextAction: "Pipeline complete",
      promptLanguage: "ko",
      promptValidationErrors: [],
      promptRepairActions: [],
      compiledPrompt: "Create a new file",
      role2Handoff: "Create a new file",
      rawOutput:
        "[stub:codex] [CREATE] Create a new file\n\nContext: No previous task context available.",
    });
    expect(result.promptInferenceTimeSec).toBeGreaterThanOrEqual(0);
  });

  it("skips completed tasks from an existing session and resumes remaining work", async () => {
    vi.spyOn(SessionStateManager, "sessionExists").mockResolvedValue(true);
    vi.spyOn(SessionStateManager, "loadSession").mockResolvedValue({
      version: "1",
      shared_context: {
        session_id: "resume_session",
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
      updated_at: "2026-04-27T00:00:00.000Z",
    });
    const saveSessionSpy = vi
      .spyOn(SessionStateManager, "saveSession")
      .mockResolvedValue(undefined);
    executeWithAdapterMock.mockResolvedValueOnce({
      ok: true,
      adapter: "codex",
      rawOutput: "[mock-resume] t2",
      exitCode: 0,
    });

    const result = await orchestratePipeline({
      mode: "run",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      userRequest: {
        raw_input: "Find the auth module. Test the auth module.",
        session_id: "resume_session",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.taskRecords).toEqual([
      { taskId: "t1", status: "completed", rawOutput: "previous raw" },
      { taskId: "t2", status: "completed", rawOutput: "[mock-resume] t2" },
    ]);
    expect(executeWithAdapterMock).toHaveBeenCalledTimes(1);
    expect(executeWithAdapterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("[VALIDATE] Test the auth module"),
        sessionId: "resume_session",
      }),
    );
    expect(saveSessionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        completed_task_ids: ["t1", "t2"],
      }),
    );
  });

  it("continues a REPL session with new task ids and previous context for new input", async () => {
    vi.spyOn(SessionStateManager, "sessionExists").mockResolvedValue(true);
    vi.spyOn(SessionStateManager, "loadSession").mockResolvedValue({
      version: "1",
      shared_context: {
        session_id: "repl_session",
        raw_input: "Compare JavaScript array sorting methods",
      },
      task_results: {
        t1: {
          task_id: "t1",
          success: true,
          summary: "sort is fastest but mutates the source array",
          raw_output: "sort is fastest but mutates the source array",
        },
      },
      current_task_id: null,
      completed_task_ids: ["t1"],
      updated_at: "2026-04-27T00:00:00.000Z",
    });
    const saveSessionSpy = vi
      .spyOn(SessionStateManager, "saveSession")
      .mockResolvedValue(undefined);
    executeWithAdapterMock.mockResolvedValueOnce({
      ok: true,
      adapter: "gemini",
      rawOutput: "[mock-repl] follow-up",
      exitCode: 0,
    });

    const result = await orchestratePipeline({
      mode: "repl",
      adapter: "gemini",
      executionMode: "stub",
      verbose: false,
      userRequest: {
        raw_input: "What is the downside of the fastest method?",
        session_id: "repl_session",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.taskRecords).toEqual([
      { taskId: "t2", status: "completed", rawOutput: "[mock-repl] follow-up" },
    ]);
    expect(executeWithAdapterMock).toHaveBeenCalledTimes(1);
    expect(executeWithAdapterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Task [t1]: sort is fastest"),
        sessionId: "repl_session",
      }),
    );
    expect(saveSessionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        completed_task_ids: ["t1", "t2"],
        shared_context: expect.objectContaining({
          raw_input: "What is the downside of the fastest method?",
          input_history: [
            "Compare JavaScript array sorting methods",
            "What is the downside of the fastest method?",
          ],
        }),
      }),
    );
  });

  it("does not overwrite an existing session when loading it fails", async () => {
    vi.spyOn(SessionStateManager, "sessionExists").mockResolvedValue(true);
    vi.spyOn(SessionStateManager, "loadSession").mockRejectedValue(
      new Error("Session file is corrupted"),
    );
    const saveSessionSpy = vi
      .spyOn(SessionStateManager, "saveSession")
      .mockResolvedValue(undefined);

    const result = await orchestratePipeline({
      mode: "run",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      userRequest: {
        raw_input: "hello detoks",
        session_id: "corrupt_session",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.sessionId).toBe("corrupt_session");
    expect(result.summary).toBe("Session load failed: Session file is corrupted");
    expect(result.nextAction).toBe("Fix or reset the existing session before retrying");
    expect(saveSessionSpy).not.toHaveBeenCalled();
    expect(executeWithAdapterMock).not.toHaveBeenCalled();
  });

  it("retries a previously failed task and unblocks its dependent task on success", async () => {
    vi.spyOn(SessionStateManager, "sessionExists").mockResolvedValue(true);
    vi.spyOn(SessionStateManager, "loadSession").mockResolvedValue({
      shared_context: {
        session_id: "resume_failed_session",
        raw_input: "Find the auth module. Test the auth module.",
        failed_task_ids: ["t1"],
      },
      task_results: {
        t1: {
          task_id: "t1",
          success: false,
          summary: "old failure",
          raw_output: "old failure",
        },
      },
      current_task_id: "t1",
      completed_task_ids: [],
      updated_at: "2026-04-27T00:00:00.000Z",
    });
    vi.spyOn(SessionStateManager, "saveSession").mockResolvedValue(undefined);
    executeWithAdapterMock
      .mockResolvedValueOnce({
        ok: true,
        adapter: "codex",
        rawOutput: "[mock-retry] t1",
        exitCode: 0,
      })
      .mockResolvedValueOnce({
        ok: true,
        adapter: "codex",
        rawOutput: "[mock-retry] t2",
        exitCode: 0,
      });

    const result = await orchestratePipeline({
      mode: "run",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      userRequest: {
        raw_input: "Find the auth module. Test the auth module.",
        session_id: "resume_failed_session",
      },
    });

    expect(result.ok).toBe(true);
    expect(executeWithAdapterMock).toHaveBeenCalledTimes(2);
    expect(result.taskRecords).toEqual([
      { taskId: "t1", status: "completed", rawOutput: "[mock-retry] t1" },
      { taskId: "t2", status: "completed", rawOutput: "[mock-retry] t2" },
    ]);
  });
});
