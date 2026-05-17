import type { VectorStore } from "./vector-store.js";
import type { SessionState } from "../../schemas/pipeline.js";

interface Embedder {
  embed(text: string): Promise<Float32Array>;
}

export interface RagIndexingFailure {
  id: string;
  kind: "prompt" | "task" | "output";
  sessionId: string;
  taskId?: string;
  reason: string;
}

export interface RagIndexingResult {
  attempted: number;
  indexed: number;
  skipped: number;
  failures: RagIndexingFailure[];
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
        const slice = trimmed.slice(i, i +
MAX_EMBED_CHARS).trim();
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

  async indexSession(session: SessionState):
Promise<RagIndexingResult> {
    const sessionId = session.shared_context.session_id;
    const result: RagIndexingResult = {
      attempted: 0,
      indexed: 0,
      skipped: 0,
      failures: [],
    };

    const indexChunks = async (
      kind: "prompt" | "task" | "output",
      taskId: string | undefined,
      chunks: string[],
      idForIndex: (index: number) => string,
    ): Promise<void> => {
      for (const [index, chunk] of chunks.entries()) {
        const id = idForIndex(index);
        result.attempted += 1;
        try {
          const vec = await this.embedder.embed(chunk);
          this.store.upsert(id, vec, {
            kind,
            session_id: sessionId,
            ...(taskId ? { task_id: taskId } : {}),
          });
          result.indexed += 1;
        } catch (error) {
          result.skipped += 1;
          result.failures.push({
            id,
            kind,
            sessionId,
            ...(taskId ? { taskId } : {}),
            reason: error instanceof Error ? error.message :
String(error),
          });
        }
      }
    };

    await indexChunks(
      "prompt",
      undefined,
      chunkTextForEmbedding(session.shared_context.raw_input ??
""),
      (index) => index === 0 ? `prompt::${sessionId}` : `prompt::
${sessionId}::chunk${index + 1}`,
    );

    for (const [taskId, rawResult] of
Object.entries(session.task_results ?? {})) {
      const taskResult = rawResult as { success?: boolean;
summary?: string; raw_output?: string };
      if (!taskResult.success) continue;

      const taskText = taskResult.summary ??
taskResult.raw_output ?? taskId;
      await indexChunks(
        "task",
        taskId,
        chunkTextForEmbedding(taskText),
        (index) => index === 0 ? `task::${sessionId}::${taskId}
` : `task::${sessionId}::${taskId}::chunk${index + 1}`,
      );

      await indexChunks(
        "output",
        taskId,
        chunkTextForEmbedding(taskResult.raw_output ?? ""),
        (index) => index === 0 ? `output::${sessionId}::${taskId}
` : `output::${sessionId}::${taskId}::chunk${index + 1}`,
      );
    }

    return result;
  }
}