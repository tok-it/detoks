import { homedir } from "node:os";
import { join } from "node:path";

export interface DetoksModelDescriptor {
  hfRepo: string;
  hfFile: string;
}

export const getDetoksModelsRootDir = (): string =>
  join(homedir(), ".detoks", "models");

const getRepoPathParts = (hfRepo: string): [string, string] => {
  const repoWithoutRevision = hfRepo.trim().split(":")[0]?.trim() || "";
  const [author, repoName] = repoWithoutRevision
    .replace(/\\/gu, "/")
    .split("/")
    .filter(Boolean);

  return [
    sanitizePathSegment(author ?? "unknown-author"),
    sanitizePathSegment(repoName ?? "unknown-model"),
  ];
};

const sanitizePathSegment = (value: string): string => {
  const sanitized = value
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  return sanitized || "unknown-model";
};

export const getDetoksModelDir = (model: DetoksModelDescriptor): string =>
  join(getDetoksModelsRootDir(), ...getRepoPathParts(model.hfRepo));

export const getDetoksModelFilePath = (model: DetoksModelDescriptor): string =>
  join(getDetoksModelDir(model), model.hfFile);
