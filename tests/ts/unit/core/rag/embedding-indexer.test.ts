import { describe, expect, it, vi, beforeEach } from "vitest";
  import { EmbeddingIndexer } from "../../../../../src/core/rag/
  embedding-indexer.js";
  import type { VectorStore } from "../../../../../src/core/rag/
  vector-store.js";

  const makeVec = (n: number) => new Float32Array(n).fill(0.1);

  function makeMockStore(): VectorStore {
    return {
      upsert: vi.fn(),
      search: vi.fn().mockReturnValue([]),
      delete: vi.fn(),
      getStats: vi.fn(() => ({ rowCount: 0, sessionCount: 0 })),
      open: vi.fn(),
      close: vi.fn(),
    } as unknown as VectorStore;
  }

  function makeMockEmbedder() {
    return { embed: vi.fn().mockResolvedValue(makeVec(4)) };
  }

  function makeSession(overrides: Record<string, unknown> = {}) {
    return {
      shared_context: {
        session_id: "sess-abc",
        raw_input: "Find the auth module",
        raw_input_hash: "abc123",
        ...((overrides.shared_context as object) ?? {}),
      },
      task_results: {
        t1: {
          task_id: "t1",
          success: true,
          raw_output: "Found auth.ts with verifyToken",
          summary: "Found auth module",
          input_hash: "taskhash001",
        },
      },
      current_task_id: null,
      completed_task_ids: ["t1"],
      updated_at: new Date().toISOString(),
      ...overrides,
    };
  }

  describe("EmbeddingIndexer", () => {
    let store: VectorStore;
    let embedder: ReturnType<typeof makeMockEmbedder>;
    let indexer: EmbeddingIndexer;

    beforeEach(() => {
      store = makeMockStore();
      embedder = makeMockEmbedder();
      indexer = new EmbeddingIndexer(store, embedder);
    });

    it("세션 완료 후 raw_input을 prompt 벡터로 인덱싱한다", async
  () => {
      await indexer.indexSession(makeSession() as any);


  expect(embedder.embed).toHaveBeenCalledWith(expect.stringContaini
  ng("Find the auth module"));
      expect(store.upsert).toHaveBeenCalledWith(
        expect.stringContaining("prompt::sess-abc"),
        expect.any(Float32Array),
        expect.objectContaining({ kind: "prompt", session_id:
  "sess-abc" }),
      );
    });

    it("완료된 task의 title(raw_output)을 task 벡터로 인덱싱한다",
  async () => {
      await indexer.indexSession(makeSession() as any);

      expect(store.upsert).toHaveBeenCalledWith(
        expect.stringContaining("task::sess-abc::t1"),
        expect.any(Float32Array),
        expect.objectContaining({ kind: "task", session_id: "sess-
  abc", task_id: "t1" }),
      );
    });

    it("raw_output을 output 벡터로 인덱싱한다", async () => {
      await indexer.indexSession(makeSession() as any);

      expect(store.upsert).toHaveBeenCalledWith(
        expect.stringContaining("output::sess-abc::t1"),
        expect.any(Float32Array),
        expect.objectContaining({ kind: "output", session_id:
  "sess-abc", task_id: "t1" }),
      );
    });

    it("긴 raw_output은 여러 output 청크로 나눠 인덱싱한다", async
  () => {
      const session = makeSession({
        task_results: {
          t1: {
            task_id: "t1",
            success: true,
            summary: "Found auth module",
            raw_output: "긴 출력 ".repeat(400),
            input_hash: "taskhash001",
          },
        },
      });

      await indexer.indexSession(session as any);

      const outputCalls = (store.upsert as ReturnType<typeof
  vi.fn>).mock.calls.filter(
        (c) => typeof c[0] === "string" &&
  c[0].startsWith("output::sess-abc::t1"),
      );
      expect(outputCalls.length).toBeGreaterThan(1);
    });

    it("raw_output 청크 일부가 실패해도 task summary 인덱싱은 유지
  하고 실패만 집계한다", async () => {
      let callCount = 0;
      embedder.embed.mockImplementation(async () => {
        callCount += 1;
        if (callCount === 3) throw new Error("output chunk
  failed");
        return makeVec(4);
      });

      const indexing = await indexer.indexSession(makeSession() as
  any);

      expect(store.upsert).toHaveBeenCalledWith(
        expect.stringContaining("task::sess-abc::t1"),
        expect.any(Float32Array),
        expect.objectContaining({ kind: "task", session_id: "sess-
  abc", task_id: "t1" }),
      );
      expect(indexing.indexed).toBe(2);
      expect(indexing.skipped).toBe(1);
      expect(indexing.failures).toEqual([
        expect.objectContaining({
          id: "output::sess-abc::t1",
          kind: "output",
          sessionId: "sess-abc",
          taskId: "t1",
          reason: "output chunk failed",
        }),
      ]);
    });

    it("raw_input이 없는 세션은 prompt 인덱싱을 건너뛴다", async ()
  => {
      const session = makeSession({
        shared_context: { session_id: "sess-no-input", raw_input:
  "" },
      });
      await indexer.indexSession(session as any);

      const promptCalls = (store.upsert as ReturnType<typeof
  vi.fn>).mock.calls.filter(
        (c) => c[0].includes("prompt::"),
      );
      expect(promptCalls).toHaveLength(0);
    });

    it("success=false인 task는 인덱싱하지 않는다", async () => {
      const session = makeSession({
        task_results: {
          t1: { task_id: "t1", success: false, raw_output: "failed
  output", summary: "fail", input_hash: "h1" },
        },
      });
      await indexer.indexSession(session as any);

      const taskCalls = (store.upsert as ReturnType<typeof
  vi.fn>).mock.calls.filter(
        (c) => (c[0] as string).startsWith("task::"),
      );
      expect(taskCalls).toHaveLength(0);
    });
  });