import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
    vi.unstubAllGlobals();
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
    expect(result.summary).toBe("1개 작업을 모두 완료했습니다");
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
    expect(result.tokenMetrics).not.toBeNull();
    expect(result.tokenMetrics?.model).toBe("o200k_base");
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
      "프롬프트 컴파일 실패: LLM client requires LOCAL_LLM_API_BASE",
    );
    expect(result.nextAction).toContain("LOCAL_LLM_API_BASE");
    expect(result.taskRecords).toEqual([]);
    expect(result.rawOutput).toBe("LLM client requires LOCAL_LLM_API_BASE");
    expect(executeWithAdapterMock).not.toHaveBeenCalled();
  });

  it("returns a clear failure when the local GGUF model file is empty", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "detoks-orch-"));
    const modelPath = join(cwd, "broken.gguf");
    writeFileSync(modelPath, "", "utf8");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({ ok: false } as Response);
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await orchestratePipeline({
        mode: "run",
        adapter: "codex",
        executionMode: "stub",
        verbose: false,
        userRequest: {
          raw_input: "새 파일을 생성해",
          cwd,
        },
        env: {
          LOCAL_LLM_API_BASE: "http://127.0.0.1:12370/v1",
          LOCAL_LLM_MODEL_NAME: "broken-model",
          LOCAL_LLM_MODEL_PATH: modelPath,
          LOCAL_LLM_SERVER_BINARY: "llama-server",
        },
      });

      expect(result.ok).toBe(false);
      expect(result.summary).toContain("로컬 GGUF 모델 파일이 비어 있습니다");
      expect(result.nextAction).toContain("LOCAL_LLM_MODEL_PATH");
      expect(result.rawOutput).toContain("0바이트");
      expect(executeWithAdapterMock).not.toHaveBeenCalled();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
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
        LOCAL_LLM_API_BASE: "http://127.0.0.1:1234/v1",
        LOCAL_LLM_API_KEY: "test-key",
        LOCAL_LLM_MODEL_NAME: "local-model",
        TRANSLATION_MAX_ATTEMPTS: "1",
        TEMPERATURE: "0",
      },
      fetchImplementation,
      compressionImplementation: vi.fn(async () => ({
        compressed: "Create a new file",
        compression_ratio: 1,
        tokens_saved: 0,
      })),
    });

    expect(fetchImplementation).toHaveBeenCalledOnce();
    const fetchCalls = fetchImplementation.mock.calls as unknown as Array<
      [string | URL | Request, RequestInit?]
    >;
    expect(fetchCalls[0]?.[0]).toBe("http://127.0.0.1:1234/v1/chat/completions");
    const headers = fetchCalls[0]?.[1]?.headers;
    const authorization =
      headers && typeof (headers as Headers).get === "function"
        ? (headers as Headers).get("authorization")
        : (headers as Record<string, string> | undefined)?.authorization;
    const contentType =
      headers && typeof (headers as Headers).get === "function"
        ? (headers as Headers).get("content-type")
        : (headers as Record<string, string> | undefined)?.["content-type"];
    expect(authorization).toBe("Bearer test-key");
    expect(contentType).toBe("application/json");
    expect(JSON.parse(String(fetchCalls[0]?.[1]?.body))).toMatchObject({
      model: "local-model",
      temperature: 0,
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
      summary: "1개 작업을 모두 완료했습니다",
      nextAction: "파이프라인이 완료되었습니다.",
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
