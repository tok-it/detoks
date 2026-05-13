import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export const RAG_EMBEDDING_DIMS = 1024; // BGE-M3 dense vector dimension

export const getRagModelPath = (): string | undefined => {
  const fromEnv = process.env.RAG_EMBEDDING_MODEL_PATH?.trim();
  if (fromEnv) return resolve(fromEnv);
  return undefined;
};

export const getRagVectorDbPath = (cwd: string = process.cwd()): string =>
  join(cwd, ".state", "rag", "vectors.db");

export const isEmbeddingModelPresent = (): boolean => {
  const modelPath = getRagModelPath();
  return modelPath !== undefined && existsSync(modelPath);
};

export const isRagEnabled = (): boolean => {
  if (process.env.RAG_ENABLED === "0") return false;
  return isEmbeddingModelPresent();
};
