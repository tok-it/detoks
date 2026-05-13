import { describe, expect, it, vi, beforeEach } from "vitest";
import { SemanticRetriever } from "../../../../../src/core/rag/semantic-retriever.js";
import type { VectorStore } from "../../../../../src/core/rag/vector-store.js";

const makeVec = (vals: number[]) => new Float32Array(vals);

function makeMockStore(searchResults: ReturnType<VectorStore["search"]> = []): VectorStore {
  return {
    upsert: vi.fn(),
    search: vi.fn().mockReturnValue(searchResults),
    delete: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
  } as unknown as VectorStore;
}

function makeMockEmbedder(vec = makeVec([1, 0, 0, 0])) {
  return { embed: vi.fn().mockResolvedValue(vec) };
}

describe("SemanticRetriever", () => {
  it("findSimilarTasks(F4) — kind=task 필터로 검색한다", async () => {
    const store = makeMockStore([
      { id: "task::s1::t1", distance: 0.1, meta: { kind: "task", session_id: "s1", task_id: "t1" } },
    ]);
    const embedder = makeMockEmbedder();
    const retriever = new SemanticRetriever(store, embedder);

    const results = await retriever.findSimilarTasks("auth module", 5);

    expect(embedder.embed).toHaveBeenCalledWith("auth module");
    expect(store.search).toHaveBeenCalledWith(expect.any(Float32Array), 5, { kind: "task" });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("task::s1::t1");
  });

  it("findSimilarPrompts(F5) — kind=prompt 필터로 검색한다", async () => {
    const store = makeMockStore([
      { id: "prompt::s2", distance: 0.05, meta: { kind: "prompt", session_id: "s2" } },
    ]);
    const embedder = makeMockEmbedder();
    const retriever = new SemanticRetriever(store, embedder);

    const results = await retriever.findSimilarPrompts("JWT 토큰 구현", 3);

    expect(store.search).toHaveBeenCalledWith(expect.any(Float32Array), 3, { kind: "prompt" });
    expect(results[0]!.meta.kind).toBe("prompt");
  });

  it("findSimilarOutputs(F6) — kind=output 필터로 검색한다", async () => {
    const store = makeMockStore([
      { id: "output::s3::t2", distance: 0.2, meta: { kind: "output", session_id: "s3", task_id: "t2" } },
    ]);
    const embedder = makeMockEmbedder();
    const retriever = new SemanticRetriever(store, embedder);

    const results = await retriever.findSimilarOutputs("verifyToken result", 3);

    expect(store.search).toHaveBeenCalledWith(expect.any(Float32Array), 3, { kind: "output" });
    expect(results[0]!.meta.kind).toBe("output");
  });

  it("hybridSearch(F7) — task+prompt+output 결합 후 distance 오름차순 정렬", async () => {
    const store = makeMockStore();
    (store.search as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce([{ id: "task::s1::t1", distance: 0.3, meta: { kind: "task", session_id: "s1" } }])
      .mockReturnValueOnce([{ id: "prompt::s2",   distance: 0.1, meta: { kind: "prompt", session_id: "s2" } }])
      .mockReturnValueOnce([{ id: "output::s3::t1", distance: 0.2, meta: { kind: "output", session_id: "s3" } }]);

    const embedder = makeMockEmbedder();
    const retriever = new SemanticRetriever(store, embedder);

    const results = await retriever.hybridSearch("auth token", 5);

    expect(results[0]!.distance).toBeLessThanOrEqual(results[1]!.distance);
    expect(results[1]!.distance).toBeLessThanOrEqual(results[2]!.distance);
    expect(results).toHaveLength(3);
  });

  it("결과가 없을 때 빈 배열을 반환한다", async () => {
    const store = makeMockStore([]);
    const embedder = makeMockEmbedder();
    const retriever = new SemanticRetriever(store, embedder);

    const results = await retriever.findSimilarTasks("nothing", 5);
    expect(results).toHaveLength(0);
  });
});
