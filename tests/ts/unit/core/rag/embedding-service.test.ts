import { describe, expect, it, vi, beforeEach } from "vitest";
import { EmbeddingService } from "../../../../../src/core/rag/embedding-service.js";

// node-llama-cpp 전체 모킹 — CI에 실제 BGE-M3 모델이 없어서
vi.mock("node-llama-cpp", () => {
  const mockCtx = {
    getEmbeddingFor: vi.fn().mockResolvedValue({
      vector: new Float32Array([0.1, 0.2, 0.3, 0.4]),
    }),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
  const mockModel = {
    createEmbeddingContext: vi.fn().mockResolvedValue(mockCtx),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
  const mockLlama = {
    loadModel: vi.fn().mockResolvedValue(mockModel),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
  return {
    getLlama: vi.fn().mockResolvedValue(mockLlama),
  };
});

describe("EmbeddingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("embed — 텍스트를 Float32Array로 반환한다", async () => {
    const svc = new EmbeddingService("/fake/model.gguf");
    await svc.init();
    const vec = await svc.embed("hello");
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBeGreaterThan(0);
    await svc.dispose();
  });

  it("embedBatch — 여러 텍스트를 병렬로 임베딩한다", async () => {
    const svc = new EmbeddingService("/fake/model.gguf");
    await svc.init();
    const vecs = await svc.embedBatch(["hello", "world", "detoks"]);
    expect(vecs).toHaveLength(3);
    expect(vecs.every(v => v instanceof Float32Array)).toBe(true);
    await svc.dispose();
  });

  it("embed — 빈 텍스트를 잘라낸 후에도 에러 없이 처리한다", async () => {
    const svc = new EmbeddingService("/fake/model.gguf");
    await svc.init();
    await expect(svc.embed("  ")).resolves.toBeInstanceOf(Float32Array);
    await svc.dispose();
  });

  it("dispose — 중복 호출해도 에러가 없다", async () => {
    const svc = new EmbeddingService("/fake/model.gguf");
    await svc.init();
    await svc.dispose();
    await expect(svc.dispose()).resolves.toBeUndefined();
  });
});
