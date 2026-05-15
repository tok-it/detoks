import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { getDetoksModelFilePath } from "../model-store.js";
import { KURE_EMBEDDING_MODEL } from "../../cli/model-setup/models.js";
import { resolveProjectRagDir } from "../state/storage-paths.js";

export const RAG_EMBEDDING_DIMS = 1024; // KURE-v1 dense vector dimension

const getDefaultEmbeddingModelPath = (): string =>
  getDetoksModelFilePath(KURE_EMBEDDING_MODEL);

export const getRagModelPath = (): string | undefined => {
  const fromEnv = process.env.RAG_EMBEDDING_MODEL_PATH?.trim();
  if (fromEnv) return resolve(fromEnv);
  return getDefaultEmbeddingModelPath();
};

export const getRagVectorDbPath = (cwd: string = process.cwd()): string =>
  join(resolveProjectRagDir(cwd), "vectors.db");

export const isEmbeddingModelPresent = (): boolean => {
  const modelPath = getRagModelPath();
  return modelPath !== undefined && existsSync(modelPath);
};

export const isRagEnabled = (): boolean => {
  if (process.env.RAG_ENABLED === "0") return false;
  return isEmbeddingModelPresent();
};
