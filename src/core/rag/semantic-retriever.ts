import type { VectorStore, SearchResult } from "./vector-store.js";

interface Embedder {
  embed(text: string): Promise<Float32Array>;
}

export class SemanticRetriever {
  constructor(
    private readonly store: VectorStore,
    private readonly embedder: Embedder,
  ) {}

  async findSimilarTasks(query: string, k: number): Promise<SearchResult[]> {
    const vec = await this.embedder.embed(query);
    return this.store.search(vec, k, { kind: "task" });
  }

  async findSimilarPrompts(query: string, k: number): Promise<SearchResult[]> {
    const vec = await this.embedder.embed(query);
    return this.store.search(vec, k, { kind: "prompt" });
  }

  async findSimilarOutputs(query: string, k: number): Promise<SearchResult[]> {
    const vec = await this.embedder.embed(query);
    return this.store.search(vec, k, { kind: "output" });
  }

  // F7: 모든 kind를 합쳐 distance 순 정렬
  async hybridSearch(query: string, k: number): Promise<SearchResult[]> {
    const vec = await this.embedder.embed(query);
    const [tasks, prompts, outputs] = await Promise.all([
      this.store.search(vec, k, { kind: "task" }),
      this.store.search(vec, k, { kind: "prompt" }),
      this.store.search(vec, k, { kind: "output" }),
    ]);
    return [...tasks, ...prompts, ...outputs]
      .sort((a, b) => a.distance - b.distance)
      .slice(0, k);
  }
}
