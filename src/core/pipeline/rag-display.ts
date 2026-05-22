import type { RagSnippet } from "../rag/rag-context-loader.js";
import type { RagContextDisplayItem } from "./types.js";

export interface RagMetaSource {
  title?: string;
  input_hash?: string;
  depends_on?: string[];
}

export const extractRagMeta = (task?: RagMetaSource): RagMetaSource => {
  if (!task) return {};
  return {
    ...(task.title !== undefined ? { title: task.title } : {}),
    ...(task.input_hash !== undefined ? { input_hash: task.input_hash } : {}),
    ...(task.depends_on !== undefined ? { depends_on: task.depends_on } : {}),
  };
};

export const normalizeRagPreview = (content: string, maxLength = 80): string => {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};

export const toRagDisplaySourceType = (kind: RagSnippet["kind"]): RagContextDisplayItem["sourceType"] => {
  if (kind === "prompt") return "previous_request";
  if (kind === "output") return "previous_output";
  return "previous_task";
};

export const toRagRelevance = (distance: number): RagContextDisplayItem["relevance"] => {
  if (distance <= 0.35) return "high";
  if (distance <= 0.65) return "medium";
  return "low";
};

export const toRagDisplayItem = (snippet: RagSnippet): RagContextDisplayItem => ({
  sourceType: toRagDisplaySourceType(snippet.kind),
  sessionId: snippet.session_id,
  ...(snippet.task_id ? { taskId: snippet.task_id } : {}),
  preview: normalizeRagPreview(snippet.content),
  relevance: toRagRelevance(snippet.distance),
  injected: false,
});
