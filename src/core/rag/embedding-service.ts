import { getLlama, LlamaLogLevel } from "node-llama-cpp";
import type { Llama, LlamaModel, LlamaEmbeddingContext } from "node-llama-cpp";

export class EmbeddingService {
  private ctx: LlamaEmbeddingContext | null = null;
  private model: LlamaModel | null = null;
  private llama: Llama | null = null;
  private disposed = false;

  constructor(private readonly modelPath: string) {}

  async init(): Promise<void> {
    if (this.ctx) return;
    this.llama = await getLlama({ gpu: false, logLevel: LlamaLogLevel.fatal, progressLogs: false });
    this.model = await this.llama.loadModel({ modelPath: this.modelPath });
    this.ctx = await this.model.createEmbeddingContext();
  }

  async embed(text: string): Promise<Float32Array> {
    if (!this.ctx) throw new Error("EmbeddingService not initialized");
    const normalized = text.trim() || " ";
    const result = await this.ctx.getEmbeddingFor(normalized);
    return new Float32Array(result.vector);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.ctx?.dispose();
    await this.model?.dispose();
    await this.llama?.dispose();
    this.ctx = null;
    this.model = null;
    this.llama = null;
  }
}
