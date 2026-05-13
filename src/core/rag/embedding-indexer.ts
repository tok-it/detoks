import type { VectorStore } from "./vector-store.js";
import type { SessionState } from "../../schemas/pipeline.js";

interface Embedder {
  embed(text: string): Promise<Float32Array>;
}

export class EmbeddingIndexer {
  constructor(
    private readonly store: VectorStore,
    private readonly embedder: Embedder,
  ) {}

  async indexSession(session: SessionState): Promise<void> {
    const sessionId = session.shared_context.session_id;

    if (session.shared_context.raw_input) {
      const vec = await this.embedder.embed(session.shared_context.raw_input);
      this.store.upsert(`prompt::${sessionId}`, vec, { kind: "prompt", session_id: sessionId });
    }

    for (const [taskId, rawResult] of Object.entries(session.task_results ?? {})) {
      const result = rawResult as { success?: boolean; summary?: string; raw_output?: string };
      if (!result.success) continue;

      const taskText = result.summary ?? result.raw_output ?? taskId;
      const taskVec = await this.embedder.embed(taskText);
      this.store.upsert(`task::${sessionId}::${taskId}`, taskVec, {
        kind: "task",
        session_id: sessionId,
        task_id: taskId,
      });

      if (result.raw_output) {
        const outVec = await this.embedder.embed(result.raw_output);
        this.store.upsert(`output::${sessionId}::${taskId}`, outVec, {
          kind: "output",
          session_id: sessionId,
          task_id: taskId,
        });
      }
    }
  }
}
