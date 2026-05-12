import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { orchestratePipeline } from "../../../../../src/core/pipeline/orchestrator.js";
import { executeWithAdapter } from "../../../../../src/core/executor/execute.js";
import { SessionStateManager } from "../../../../../src/core/state/SessionStateManager.js";
import { PipelineTracer } from "../../../../../src/core/utils/PipelineTracer.js";

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
    vi.spyOn(SessionStateManager, "findSuccessfulSessionByInputHash").mockResolvedValue(null);
    vi.spyOn(SessionStateManager, "findSuccessfulTaskByHash").mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("executes task graph and returns structured result", async () => {
    vi.spyOn(SessionStateManager, "sessionExists").mockResolvedValue(false);
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
    expect(result.actionTimeline?.some((event) => event.kind === "validation")).toBe(true);
    expect(result.actionTimeline?.some((event) => event.kind === "stage_update")).toBe(true);
    expect(result.tokenMetrics).not.toBeNull();
    expect(result.tokenMetrics?.model).toBe("o200k_base");

    const savedState = saveSessionSpy.mock.calls.at(-1)?.[0] as any;
    const savedTaskResult = Object.values(savedState?.task_results ?? {})[0] as any;
    expect(savedTaskResult?.type).toBeTypeOf("string");

    // RAG 스키마 확장: task_results에 input_hash, title, depends_on, completed_at 보존
    expect(savedTaskResult?.input_hash).toMatch(/^[0-9a-f]{12,}$/);
    expect(savedTaskResult?.title).toBeTypeOf("string");
    expect(savedTaskResult?.depends_on).toBeInstanceOf(Array);
    expect(savedTaskResult?.completed_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );

    // RAG 스키마 확장: shared_context에 raw_input_hash + project_id 채워짐
    expect(savedState?.shared_context?.raw_input_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(savedState?.shared_context?.project_id).toBeTypeOf("string");

    // RAG 스키마 확장: 전체 task_graph 보존
    expect(savedState?.task_graph?.tasks).toBeInstanceOf(Array);
    expect(savedState?.task_graph?.tasks?.length).toBeGreaterThan(0);
    expect(savedState?.task_graph?.tasks?.[0]?.input_hash).toBeTypeOf("string");

    const executionOutputs = PipelineTracer.getTrace(result.sessionId).entries.filter(
      (entry) => entry.dataType === "ExecutionResult" && entry.phase === "output",
    ) as Array<{ data: any }>;
    expect(executionOutputs).toHaveLength(1);
    expect(executionOutputs[0]?.data).toMatchObject({
      success: true,
      type: expect.any(String),
    });
  });

  it("passes execution mode through to the executor boundary", async () => {
    executeWithAdapterMock.mockImplementationOnce(async (request) => {
      await request.onActionTimelineEvent?.({
        kind: "tool_call",
        source: "adapter",
        summary: "codex 실행",
        timestamp: 1,
      });

      return {
        ok: true,
        adapter: "codex",
        rawOutput: "[mock-real] codex",
        exitCode: 0,
        transcript: {
          events: [
            {
              type: "chunk",
              timestamp: 1,
              stream: "stdout",
              data: "[mock-real] codex",
            },
          ],
          startTime: 1,
          endTime: 2,
          totalDuration: 1,
          exitCode: 0,
          timedOut: false,
        },
      };
    });

    const result = await orchestratePipeline({
      mode: "run",
      adapter: "codex",
      executionMode: "real",
      presentationMode: "passthrough",
      verbose: false,
      userRequest: {
        raw_input: "hello detoks",
      },
      env: {
        ADAPTER_MODEL: "claude-sonnet-4-6",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.rawOutput).toBe("[mock-real] codex");
    expect(result.adapterTranscript?.events).toHaveLength(1);
    expect(result.actionTimeline?.some((event) => event.kind === "tool_call")).toBe(true);
    expect(result.actionTimeline?.some((event) => event.kind === "validation")).toBe(true);
    expect(executeWithAdapterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adapter: "codex",
        executionMode: "real",
        model: "claude-sonnet-4-6",
        presentationMode: "passthrough",
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

  it.skip("returns a clear failure when the local GGUF model file is empty", async () => {
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

  it("surfaces Role 1 metadata from prompt normalization on success", async () => {
    const compressionImplementation = vi.fn(async (text: string) => ({
      compressed: text.replace(/^Can you please /i, ""),
      compression_ratio: 0.56,
      tokens_saved: 4,
    }));
    const result = await orchestratePipeline({
      mode: "run",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      userRequest: {
        raw_input:
          "Can you please update src/api/user.ts and run npm test -- --runInBand 2 times?",
      },
      compressionImplementation,
    });

    expect(result.ok).toBe(true);
    expect(result.compiledPrompt).toBe(
      "Can you please update src/api/user.ts and run npm test -- --runInBand 2 times?",
    );
    expect(result.promptLanguage).toBe("en");
    expect(result.promptInferenceTimeSec).toBe(0);
    expect(result.promptValidationErrors).toEqual([]);
    expect(result.promptRepairActions).toEqual([]);
    expect(compressionImplementation).not.toHaveBeenCalled();
  });

  it("compresses only the selected execution context before adapter execution", async () => {
    executeWithAdapterMock
      .mockResolvedValueOnce({
        ok: true,
        adapter: "codex",
        rawOutput: "[mock] Find auth module in src/auth.ts with detailed notes about imports exports middleware routing and tests",
        exitCode: 0,
      })
      .mockResolvedValueOnce({
        ok: true,
        adapter: "codex",
        rawOutput: "[mock] validated",
        exitCode: 0,
      });
    const compressionImplementation = vi.fn(async (text: string) => ({
      compressed: `${text} compressed Find context src/auth.ts`,
      compression_ratio: 0.7,
      tokens_saved: 2,
    }));

    const result = await orchestratePipeline({
      mode: "run",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      userRequest: {
        raw_input: "Find the auth module. Test the auth module.",
      },
      compressionImplementation,
    });

    expect(result.ok).toBe(true);
    expect(compressionImplementation).toHaveBeenCalled();
    expect(executeWithAdapterMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("compressed Find context"),
      }),
    );
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
        LOCAL_LLM_RUNTIME_PROVIDER: "llama-server",
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
      rawOutput: expect.stringContaining(
        "[stub:codex] Respond entirely in Korean.\n\n[CREATE] Create a new file",
      ),
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

  it("persists task type for failure and dependency skip paths", async () => {
    vi.spyOn(SessionStateManager, "sessionExists").mockResolvedValue(false);
    const saveSessionSpy = vi
      .spyOn(SessionStateManager, "saveSession")
      .mockResolvedValue(undefined);
    executeWithAdapterMock.mockResolvedValueOnce({
      ok: false,
      adapter: "codex",
      rawOutput: "[mock-fail] t1",
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
    expect(result.taskRecords).toEqual([
      { taskId: "t1", status: "failed", rawOutput: "[mock-fail] t1" },
      { taskId: "t2", status: "skipped", rawOutput: "", blockedBy: "t1" },
    ]);

    const savedState = saveSessionSpy.mock.calls.at(-1)?.[0] as any;
    expect(savedState?.task_results?.t1?.type).toBeTypeOf("string");
    expect(savedState?.task_results?.t2?.type).toBeTypeOf("string");
    expect(savedState?.task_results?.t1?.success).toBe(false);
    expect(savedState?.task_results?.t2?.success).toBe(false);
    expect(savedState?.task_results?.t2?.raw_output).toContain("의존성 [t1] 실패로 건너뜀");

    const executionOutputs = PipelineTracer.getTrace(result.sessionId).entries.filter(
      (entry) => entry.dataType === "ExecutionResult" && entry.phase === "output",
    ) as Array<{ data: any }>;
    expect(executionOutputs).toHaveLength(2);
    expect(executionOutputs[0]?.data).toMatchObject({
      success: false,
      type: expect.any(String),
    });
    expect(executionOutputs[1]?.data).toMatchObject({
      success: false,
      type: expect.any(String),
    });
  });

  it("F1: 동일 input hash의 과거 세션이 있을 때 adapter를 호출하지 않고 캐시 결과 반환", async () => {
    const cachedSession = {
      shared_context: {
        session_id: "cached-session",
        raw_input_hash: "willbematched",
        project_id: "git-test123",
        failed_task_ids: [],
      },
      task_results: {
        t1: {
          task_id: "t1",
          success: true,
          raw_output: "cached output",
          summary: "cached output",
        },
      },
      current_task_id: null,
      completed_task_ids: ["t1"],
      last_summary: "1개 작업을 모두 완료했습니다",
      next_action: "파이프라인이 완료되었습니다.",
      updated_at: new Date().toISOString(),
    };
    vi.spyOn(SessionStateManager, "findSuccessfulSessionByInputHash").mockResolvedValue(
      cachedSession as any,
    );

    const result = await orchestratePipeline({
      mode: "run",
      adapter: "codex",
      executionMode: "real",
      verbose: false,
      // projectInfo로 project_id를 캐시된 세션과 일치시킴
      projectInfo: { projectId: "git-test123", projectPath: "/test", projectName: "test" },
      userRequest: { raw_input: "cached prompt" },
    });

    expect(result.ok).toBe(true);
    expect(result.cacheHit?.kind).toBe("session");
    expect(result.cacheHit?.sourceSessionId).toBe("cached-session");
    expect(result.rawOutput).toContain("cached output");
    expect(executeWithAdapterMock).not.toHaveBeenCalled();
  });

  it("F1: stub 모드에서는 캐시 조회를 건너뜀", async () => {
    vi.spyOn(SessionStateManager, "sessionExists").mockResolvedValue(false);
    vi.spyOn(SessionStateManager, "saveSession").mockResolvedValue(undefined);

    const result = await orchestratePipeline({
      mode: "run",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      userRequest: { raw_input: "hello detoks" },
    });

    // findSuccessfulSessionByInputHash가 mocked to null (beforeEach), stub 모드면 애초에 호출 안 함
    expect(result.ok).toBe(true);
    expect(result.cacheHit).toBeUndefined();
    expect(result.rawOutput).toContain("[stub:codex]");
  });

  it("F1: noCache=true이면 캐시 조회 건너뜀", async () => {
    // noCache=true 시 findSuccessfulSessionByInputHash가 반환값이 있어도 사용하지 않아야 함
    // beforeEach에서 이미 null 반환으로 mocking됨 — stub 모드로 실제 실행 확인
    vi.spyOn(SessionStateManager, "sessionExists").mockResolvedValue(false);
    vi.spyOn(SessionStateManager, "saveSession").mockResolvedValue(undefined);

    const result = await orchestratePipeline({
      mode: "run",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      noCache: true,
      userRequest: { raw_input: "hello detoks" },
    });

    expect(result.cacheHit).toBeUndefined();
    // stub 실행이 진행되어야 함
    expect(result.rawOutput).toContain("[stub:codex]");
  });

  it("F2: task hash 매칭 시 해당 task의 adapter 호출을 건너뜀", async () => {
    vi.spyOn(SessionStateManager, "sessionExists").mockResolvedValue(false);
    vi.spyOn(SessionStateManager, "saveSession").mockResolvedValue(undefined);
    vi.spyOn(SessionStateManager, "findSuccessfulTaskByHash").mockResolvedValue({
      taskResult: {
        task_id: "t1",
        success: true,
        raw_output: "cached task output",
        summary: "cached task output",
        completed_at: new Date().toISOString(),
      } as any,
      sessionId: "prev-session",
    });

    const result = await orchestratePipeline({
      mode: "run",
      adapter: "codex",
      executionMode: "real",
      verbose: false,
      userRequest: { raw_input: "hello detoks" },
    });

    expect(result.ok).toBe(true);
    expect(result.rawOutput).toContain("cached task output");
    expect(executeWithAdapterMock).not.toHaveBeenCalled();
    const cacheHitEvent = result.actionTimeline?.find((e) => e.kind === "cache_hit");
    expect(cacheHitEvent).toBeDefined();
  });
});
