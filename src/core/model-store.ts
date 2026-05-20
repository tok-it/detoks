import { join } from "node:path";
import { getDetoksHomeDir } from "./state/storage-paths.js";

export type ModelRole = "llm" | "embedding" | "compress";

export interface DetoksModelDescriptor {
  role: ModelRole;
  hfRepo: string;
  hfFile: string;
}

export const getDetoksModelsRootDir = (): string =>
  join(getDetoksHomeDir(), "models");

const sanitizePathSegment = (value: string): string => {
  const sanitized = value
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  return sanitized || "unknown-model";
};

const getHfRepoSlug = (hfRepo: string): string => {
  const repoWithoutRevision = hfRepo.trim().split(":")[0]?.trim() || "";
  const slug = repoWithoutRevision.replace(/\\/gu, "/").replace(/\//gu, "-");
  return sanitizePathSegment(slug) || "unknown-model";
};

export const getDetoksModelDir = (model: DetoksModelDescriptor): string =>
  join(getDetoksModelsRootDir(), model.role, getHfRepoSlug(model.hfRepo));

export const getDetoksModelFilePath = (model: DetoksModelDescriptor): string =>
  join(getDetoksModelDir(model), model.hfFile);
