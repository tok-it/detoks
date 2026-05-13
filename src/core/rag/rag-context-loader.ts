import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SearchResult } from "./vector-store.js";

export interface RagSnippet {
  id: string;
  kind: "task" | "prompt" | "output";
  session_id: string;
  task_id?: string;
  content: string;
  distance: number;
}

const MAX_SNIPPET_CHARS = 300;

export class RagContextLoader {
  constructor(private readonly sessionsDir: string) {}

  async load(hits: SearchResult[]): Promise<RagSnippet[]> {
    const snippets: RagSnippet[] = [];
    for (const hit of hits) {
      const sessionId = hit.meta.session_id as string;
      const taskId = hit.meta.task_id as string | undefined;
      const kind = hit.meta.kind as "task" | "prompt" | "output";

      try {
        const data = await readFile(join(this.sessionsDir, `${sessionId}.json`), "utf-8");
        const session = JSON.parse(data) as {
          shared_context?: { raw_input?: string };
          task_results?: Record<string, { summary?: string; raw_output?: string }>;
        };

        let content: string | undefined;
        if (kind === "prompt") {
          content = session.shared_context?.raw_input;
        } else if (taskId) {
          const result = session.task_results?.[taskId];
          content = kind === "task"
            ? (result?.summary ?? result?.raw_output)
            : result?.raw_output;
        }

        if (content?.trim()) {
          snippets.push({
            id: hit.id,
            kind,
            session_id: sessionId,
            ...(taskId ? { task_id: taskId } : {}),
            content: content.slice(0, MAX_SNIPPET_CHARS),
            distance: hit.distance,
          });
        }
      } catch {
        // session file missing or unreadable — skip
      }
    }
    return snippets;
  }
}

export function formatRagSnippetsForPrompt(snippets: RagSnippet[]): string {
  if (snippets.length === 0) return "";
  const lines = ["=== 관련 과거 컨텍스트 ==="];
  for (const s of snippets) {
    const label = `[${s.kind}]`;
    lines.push(`${label} ${s.content}`);
  }
  lines.push("=========================");
  return lines.join("\n");
}
