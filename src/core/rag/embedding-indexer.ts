import type { VectorStore } from "./vector-store.js";
import type { SessionState } from "../../schemas/pipeline.js";

interface Embedder {
  embed(text: string): Promise<Float32Array>;
}

const MAX_EMBED_CHARS = 1200;

function chunkTextForEmbedding(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  if (normalized.length <= MAX_EMBED_CHARS) return [normalized];

  const paragraphs = normalized.split(/\n\s*\n/g);
  const chunks: string[] = [];
  let current = "";

  const flush = (): void => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    current = "";
  };

  const append = (part: string): void => {
    const trimmed = part.trim();
    if (!trimmed) return;

    if (trimmed.length > MAX_EMBED_CHARS) {
      flush();
      for (let i = 0; i < trimmed.length; i += MAX_EMBED_CHARS) {
        const slice = trimmed.slice(i, i + MAX_EMBED_CHARS).trim();
        if (slice) chunks.push(slice);
      }
      return;
    }

    const next = current ? `${current}\n\n${trimmed}` : trimmed;
    if (next.length <= MAX_EMBED_CHARS) {
      current = next;
      return;
    }

    flush();
    current = trimmed;
  };

  for (const paragraph of paragraphs) {
    append(paragraph);
  }

  flush();
  return chunks;
}

export class EmbeddingIndexer {
  constructor(
    private readonly store: VectorStore,
    private readonly embedder: Embedder,
  ) {}

  async indexSession(session: SessionState): Promise<void> {
    const sessionId = session.shared_context.session_id;

    for (const [index, chunk] of chunkTextForEmbedding(session.shared_context.raw_input ?? "").entries()) {
      const vec = await this.embedder.embed(chunk);
      this.store.upsert(
        index === 0 ? `prompt::${sessionId}` : `prompt::${sessionId}::chunk${index + 1}`,
        vec,
        { kind: "prompt", session_id: sessionId },
      );
    }

    for (const [taskId, rawResult] of Object.entries(session.task_results ?? {})) {
      const result = rawResult as { success?: boolean; summary?: string; raw_output?: string };
      if (!result.success) continue;

      const taskText = result.summary ?? result.raw_output ?? taskId;
      for (const [index, chunk] of chunkTextForEmbedding(taskText).entries()) {
        const taskVec = await this.embedder.embed(chunk);
        this.store.upsert(
          index === 0 ? `task::${sessionId}::${taskId}` : `task::${sessionId}::${taskId}::chunk${index + 1}`,
          taskVec,
          {
            kind: "task",
            session_id: sessionId,
            task_id: taskId,
          },
        );
      }

      for (const [index, chunk] of chunkTextForEmbedding(result.raw_output ?? "").entries()) {
        const outVec = await this.embedder.embed(chunk);
        this.store.upsert(
          index === 0 ? `output::${sessionId}::${taskId}` : `output::${sessionId}::${taskId}::chunk${index + 1}`,
          outVec,
          {
            kind: "output",
            session_id: sessionId,
            task_id: taskId,
          },
        );
      }
    }
  }
}
