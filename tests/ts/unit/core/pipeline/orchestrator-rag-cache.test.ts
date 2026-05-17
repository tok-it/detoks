/**
 * orchestratePipeline — RAG 캐시 통합 테스트
 *
 * 검증 항목:
 * 1. F2 전체 캐시 hit → tasksNeedingExecution 빈 배열 → EmbeddingService 미생성
 * 2. F2 전체 miss + RAG 활성화 → EmbeddingService.init 호출
 * 3. Budget Gate: ragTokensForTask > PER_TASK_TOKEN_CAP → RAG 주입 차단
 * 4. Budget Gate: cold start · 토큰 허용 범위 → RAG 주입 허용 (tokensAddedByRagContext > 0)
 * 5. Budget Gate: not cold start · projectedSaved=0 → break-even 조건 위반 → RAG 주입 차단
 *
 * 주의: countPriorSessions 의 project_id 필터가 작동하려면
 *       listSessions mock 반환값에 project_id 필드가 포함되어야 한다.
 *       (TypeScript 타입에는 없지만 런타임에서 Record<string, unknown> 캐스팅으로 접근)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const nodeRuntimeMocks = vi.hoisted(() => ({
  buildNodeLlamaRuntimeSignature: vi.fn(() => "node-runtime-signature"),
  completeChatWithNodeLlamaCpp: vi.fn(),
  ensureNodeLlamaCppRuntime: vi.fn(async () => {}),
  shutdownNodeLlamaCppRuntime: vi.fn(async () => true),
}));

const executeWithAdapterMock = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true,
    adapter: "codex" as const,
    rawOutput: "mock executor output",
    exitCode: 0,
  })),
);

const embeddingServiceInstance = vi.hoisted(() => ({
  init: vi.fn(async () => {}),
  embed: vi.fn(async () => new Float32Array(1024)),
  dispose: vi.fn(async () => {}),
}));

const semanticRetrieverInstance = vi.hoisted(() => ({
  hybridSearch: vi.fn(async (): Promise<any[]> => []),
}));

const ragContextLoaderInstance = vi.hoisted(() => ({
  load: vi.fn(async (): Promise<any[]> => []),
}));

const vectorStoreInstance = vi.hoisted(() => ({
  open: vi.fn(),
  close: vi.fn(),
  search: vi.fn(() => []),
  upsert: vi.fn(),
  delete: vi.fn(),
  getStats: vi.fn(() => ({ rowCount: 3, sessionCount: 1 })),
}));

const countRagContextTokensMock = vi.hoisted(() =>
  vi.fn((text: string) => Math.ceil(text.length / 4)),
);

// ── Module mocks ───────────────────────────────────────────────────────────

vi.mock(
  "../../../../../src/core/llm-client/node-llama-runtime.js",
  () => nodeRuntimeMocks,
);

vi.mock("../../../../../src/core/executor/execute.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../../src/core/executor/execute.js")
  >("../../../../../src/core/executor/execute.js");
  return { ...actual, executeWithAdapter: executeWithAdapterMock };
});

vi.mock("../../../../../src/core/rag/rag-config.js", () => ({
  isRagEnabled: vi.fn(() => false),
  isEmbeddingModelPresent: vi.fn(() => false),
  getRagModelPath: vi.fn(() => "/fake/model.gguf"),
  getRagVectorDbPath: vi.fn(() => ":memory:"),
  RAG_EMBEDDING_DIMS: 1024,
}));

vi.mock("../../../../../src/core/rag/embedding-service.js", () => ({
  EmbeddingService: vi.fn(() => embeddingServiceInstance),
}));

vi.mock("../../../../../src/core/rag/vector-store.js", () => ({
  VectorStore: vi.fn(() => vectorStoreInstance),
}));

vi.mock("../../../../../src/core/rag/semantic-retriever.js", () => ({
  SemanticRetriever: vi.fn(() => semanticRetrieverInstance),
}));

vi.mock("../../../../../src/core/rag/rag-context-loader.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../../src/core/rag/rag-context-loader.js")
  >("../../../../../src/core/rag/rag-context-loader.js");
  return {
    ...actual,
    RagContextLoader: vi.fn(() => ragContextLoaderInstance),
  };
});

vi.mock("../../../../../src/core/utils/tokenAccounting.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../../src/core/utils/tokenAccounting.js")
  >("../../../../../src/core/utils/tokenAccounting.js");
  return { ...actual, countRagContextTokens: countRagContextTokensMock };
});

// ── Imports (must follow vi.mock calls) ───────────────────────────────────

import { orchestratePipeline } from "../../../../../src/core/pipeline/orchestrator.js";
import { SessionStateManager } from "../../../../../src/core/state/SessionStateManager.js";
import { isRagEnabled } from "../../../../../src/core/rag/rag-config.js";
import { EmbeddingService } from "../../../../../src/core/rag/embedding-service.js";

// ── Test fixtures ──────────────────────────────────────────────────────────

const TEST_PROJECT_ID = "test-proj-rag";

const CACHED_TASK_RESULT = {
  taskResult: {
    task_id: "t1",
    success: true,
    raw_output: "cached output",
    summary: "cached summary",
    completed_at: new Date().toISOString(),
  } as any,
  sessionId: "prev-session",
};

// listSessions 반환값: TypeScript 타입에는 없지만 countPriorSessions 필터가
// project_id 필드를 Record<string, unknown> 캐스팅으로 읽는다.
function makeSessionEntry(projectId = TEST_PROJECT_ID): any {
  return {
    id: `s-${Math.random().toString(36).slice(2)}`,
    updatedAt: new Date().toISOString(),
    currentTaskId: null,
    completedTaskCount: 1,
    taskResultCount: 1,
    nextAction: null,
    project_id: projectId,
  };
}

const FAKE_HIT = {
  id: "prompt::s1",
  distance: 0.1,
  meta: { kind: "prompt", session_id: "s1" },
};

const FAKE_SNIPPET = {
  id: "prompt::s1",
  kind: "prompt" as const,
  session_id: "s1",
  content: "auth module implementation from a previous session context",
  distance: 0.1,
};

// ── Suite ──────────────────────────────────────────────────────────────────

describe("orchestratePipeline — RAG 캐시 통합", () => {
  beforeEach(() => {
    vi.spyOn(SessionStateManager, "findSuccessfulSessionByInputHash").mockResolvedValue(null);
    vi.spyOn(SessionStateManager, "findSuccessfulTaskByHash").mockResolvedValue(null);
    vi.spyOn(SessionStateManager, "sessionExists").mockResolvedValue(false);
    vi.spyOn(SessionStateManager, "saveSession").mockResolvedValue(undefined);
    vi.spyOn(SessionStateManager, "listSessions").mockResolvedValue([]);

    vi.mocked(isRagEnabled).mockReturnValue(false);
    vi.mocked(EmbeddingService).mockClear();
    embeddingServiceInstance.init.mockClear();
    embeddingServiceInstance.embed.mockClear();
    embeddingServiceInstance.embed.mockImplementation(async () => new Float32Array(1024));
    embeddingServiceInstance.dispose.mockClear();
    semanticRetrieverInstance.hybridSearch.mockResolvedValue([]);
    ragContextLoaderInstance.load.mockResolvedValue([]);
    countRagContextTokensMock.mockImplementation((text: string) => Math.ceil(text.length / 4));
    vectorStoreInstance.open.mockClear();
    vectorStoreInstance.close.mockClear();
    vectorStoreInstance.search.mockClear();
    vectorStoreInstance.upsert.mockClear();
    vectorStoreInstance.delete.mockClear();
    vectorStoreInstance.getStats.mockClear();
    vectorStoreInstance.getStats.mockReturnValue({ rowCount: 3, sessionCount: 1 });

    nodeRuntimeMocks.completeChatWithNodeLlamaCpp.mockReset();
    nodeRuntimeMocks.buildNodeLlamaRuntimeSignature.mockClear();
    nodeRuntimeMocks.ensureNodeLlamaCppRuntime.mockClear();
    nodeRuntimeMocks.shutdownNodeLlamaCppRuntime.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // "find"는 explore 타입으로 분류됨 (RAG_ELIGIBLE_TYPES에 포함)
  const baseRequest = {
    mode: "run" as const,
    adapter: "codex" as const,
    executionMode: "real" as const,
    verbose: false,
    userRequest: { raw_input: "find the auth module" },
    projectInfo: {
      projectId: TEST_PROJECT_ID,
      projectPath: "/test",
      projectName: "test",
    },
  };

  it("F2 전체 캐시 hit → EmbeddingService 미생성 · tokensAddedByRagContext=0 · cacheHitRate=1.0", async () => {
    vi.spyOn(SessionStateManager, "findSuccessfulTaskByHash").mockResolvedValue(
      CACHED_TASK_RESULT,
    );
    vi.mocked(isRagEnabled).mockReturnValue(true);

    const result = await orchestratePipeline(baseRequest);

    expect(result.ok).toBe(true);
    // F2 pre-scan이 모든 task를 hit → tasksNeedingExecution 빈 배열
    // → isRagEnabled()가 true여도 EmbeddingService 생성 안 됨
    expect(vi.mocked(EmbeddingService)).not.toHaveBeenCalled();
    expect(result.tokenAccounting!.tokensAddedByRagContext).toBe(0);
    expect(result.lightQuality!.cacheHitRate).toBe(1.0);
  }, 30_000);

  it("RAG 인덱싱 성공 시 결과에 row/session count를 포함한다", async () => {
    vi.mocked(isRagEnabled).mockReturnValue(true);

    const result = await orchestratePipeline(baseRequest);

    expect(result.ragIndexingSummary).toMatchObject({
      status: "completed",
      attempted: 3,
      indexed: 3,
      skipped: 0,
      dbRowCount: 3,
      dbSessionCount: 1,
    });
  });

  it("RAG 인덱싱 일부 실패는 partial로 표시하고 파이프라인은 성공 유지한다", async () => {
    vi.mocked(isRagEnabled).mockReturnValue(true);
    let callCount = 0;
    embeddingServiceInstance.embed.mockImplementation(async () => {
      callCount += 1;
      if (callCount === 3) throw new Error("output chunk failed");
      return new Float32Array(1024);
    });

    const result = await orchestratePipeline(baseRequest);

    expect(result.ok).toBe(true);
    expect(result.ragIndexingSummary).toMatchObject({
      status: "partial",
      attempted: 3,
      indexed: 2,
      skipped: 1,
      dbRowCount: 3,
      dbSessionCount: 1,
    });
    expect(result.ragIndexingSummary?.failures).toEqual([
      expect.objectContaining({
        kind: "output",
        taskId: "t1",
        reason: "output chunk failed",
      }),
    ]);
  });

  it("RAG 인덱싱 전체 실패는 failed로 표시하고 파이프라인은 성공 유지한다", async () => {
    vi.mocked(isRagEnabled).mockReturnValue(true);
    vectorStoreInstance.getStats.mockImplementationOnce(() => {
      throw new Error("db unavailable");
    });

    const result = await orchestratePipeline(baseRequest);

    expect(result.ok).toBe(true);
    expect(result.ragIndexingSummary).toMatchObject({
      status: "failed",
      attempted: 0,
      indexed: 0,
      skipped: 0,
    });
    expect(result.ragIndexingSummary?.failures).toEqual([
      expect.objectContaining({
        reason: "db unavailable",
      }),
    ]);
  });

  it("RAG 활성화 + F2 전체 miss → EmbeddingService.init 호출됨", async () => {
    // findSuccessfulTaskByHash → null (beforeEach default)
    vi.mocked(isRagEnabled).mockReturnValue(true);

    const result = await orchestratePipeline(baseRequest);

    expect(result.ok).toBe(true);
    // tasksNeedingExecution.length > 0 + isRagEnabled() → EmbeddingService 초기화
    expect(embeddingServiceInstance.init).toHaveBeenCalledOnce();
  }, 30_000);

  describe("Budget Gate", () => {
    beforeEach(() => {
      vi.mocked(isRagEnabled).mockReturnValue(true);
      semanticRetrieverInstance.hybridSearch.mockResolvedValue([FAKE_HIT]);
      ragContextLoaderInstance.load.mockResolvedValue([FAKE_SNIPPET]);
    });

    it("ragTokensForTask(251) > PER_TASK_TOKEN_CAP(250) → RAG 주입 차단, ragContextInjected=false", async () => {
      countRagContextTokensMock.mockReturnValue(251);
      vi.spyOn(SessionStateManager, "listSessions").mockResolvedValue([
        makeSessionEntry(),
        makeSessionEntry(),
      ]); // 2세션 → cold start지만 251 > 250 이므로 무조건 차단

      const result = await orchestratePipeline(baseRequest);

      expect(result.ok).toBe(true);
      expect(result.lightQuality!.ragContextInjected).toBe(false);
      expect(result.tokenAccounting!.tokensAddedByRagContext).toBe(0);
    }, 30_000);

    it("cold start(2세션) · 100토큰 → RAG 주입 허용, ragContextInjected=true, tokensAdded=100", async () => {
      countRagContextTokensMock.mockReturnValue(100);
      vi.spyOn(SessionStateManager, "listSessions").mockResolvedValue([
        makeSessionEntry(),
        makeSessionEntry(),
      ]); // 2 < COLD_START_THRESHOLD(5) → cold start → break-even 조건 면제

      const result = await orchestratePipeline(baseRequest);

      expect(result.ok).toBe(true);
      expect(result.lightQuality!.ragContextInjected).toBe(true);
      expect(result.tokenAccounting!.tokensAddedByRagContext).toBe(100);
    }, 30_000);

    it("not cold start(6세션) · projectedSaved=0 · projectedAdded=100 → break-even 조건 위반 → RAG 주입 차단", async () => {
      countRagContextTokensMock.mockReturnValue(100);
      vi.spyOn(SessionStateManager, "listSessions").mockResolvedValue(
        Array.from({ length: 6 }, () => makeSessionEntry()),
      ); // 6 >= COLD_START_THRESHOLD(5) → not cold start
      // projectedSaved=0 (F2 miss, f2PreScanHits 비어있음)
      // projectedAdded=100 > 0 * RAG_BREAK_EVEN_RATIO(0.5) = 0 → block

      const result = await orchestratePipeline(baseRequest);

      expect(result.ok).toBe(true);
      expect(result.lightQuality!.ragContextInjected).toBe(false);
      expect(result.tokenAccounting!.tokensAddedByRagContext).toBe(0);
    }, 30_000);
  });
});
