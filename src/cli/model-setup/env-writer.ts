import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { TranslationModel } from "./models.js";
import { colors } from "../colors.js";

const getModelsDir = () => join(homedir(), ".detoks", "models");
const MODEL_ENV_KEYS = new Set([
  "LOCAL_LLM_MODEL_NAME",
  "MODEL_NAME",
  "LOCAL_LLM_MODEL_PATH",
  "LOCAL_LLM_HF_REPO",
  "LOCAL_LLM_HF_FILE",
]);

interface EnvEntry {
  key: string;
  value: string;
  comment?: string;
}

const parseEnvFile = (content: string): EnvEntry[] => {
  const entries: EnvEntry[] = [];

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) {
      entries.push({ key: "", value: "", comment: line });
      continue;
    }

    if (line.trim().startsWith("#")) {
      entries.push({ key: "", value: "", comment: line });
      continue;
    }

    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (!match) {
      entries.push({ key: "", value: "", comment: line });
      continue;
    }

    entries.push({
      key: match[1] || "",
      value: match[2] || "",
    });
  }

  return entries;
};

const serializeEnvFile = (entries: EnvEntry[]): string => {
  return entries.map((entry) => {
    if (!entry.key) {
      return entry.comment || "";
    }
    return `${entry.key}=${entry.value}`;
  }).join("\n");
};

const getModelEnvWriteTargets = (cwd: string): string[] => {
  const primary = join(cwd, ".env");
  const secondary = join(cwd, ".env.local");

  return existsSync(secondary) ? [primary, secondary] : [primary];
};

const getModelEnvResetTargets = (cwd: string): string[] => {
  const targets = [join(cwd, ".env"), join(cwd, ".env.local")];
  return targets.filter((target) => existsSync(target));
};

const updateEntry = (entries: EnvEntry[], key: string, value: string): void => {
  const existingIndex = entries.findIndex((entry) => entry.key === key);
  if (existingIndex >= 0) {
    const entry = entries[existingIndex];
    if (entry) {
      entry.value = value;
    }
    return;
  }

  entries.push({ key, value });
};

const removeModelEntries = (entries: EnvEntry[]): boolean => {
  const before = entries.length;
  const nextEntries = entries.filter((entry) => !MODEL_ENV_KEYS.has(entry.key));

  if (nextEntries.length === before) {
    return false;
  }

  entries.splice(0, entries.length, ...nextEntries);
  return true;
};

const mutateEnvFile = (
  envPath: string,
  mutate: (entries: EnvEntry[]) => boolean,
): boolean => {
  let content: string;

  try {
    content = readFileSync(envPath, "utf-8");
  } catch {
    content = "";
  }

  const entries = parseEnvFile(content);
  const changed = mutate(entries);

  if (!changed) {
    return false;
  }

  const updatedContent = serializeEnvFile(entries);
  writeFileSync(envPath, updatedContent, "utf-8");
  return true;
};

export const updateEnvFile = (model: TranslationModel, cwd: string = process.cwd()): void => {
  const modelsDir = getModelsDir();
  const modelFilePath = join(modelsDir, model.hfFile);
  const targets = getModelEnvWriteTargets(cwd);

  for (const envPath of targets) {
    mutateEnvFile(envPath, (entries) => {
      updateEntry(entries, "LOCAL_LLM_MODEL_NAME", model.modelName);
      updateEntry(entries, "LOCAL_LLM_MODEL_DIR", modelsDir);
      updateEntry(entries, "LOCAL_LLM_MODEL_PATH", modelFilePath);
      updateEntry(entries, "LOCAL_LLM_HF_REPO", `${model.hfRepo}:Q4_K_S`);
      updateEntry(entries, "LOCAL_LLM_HF_FILE", model.hfFile);
      return true;
    });
  }

  process.stdout.write(
    colors.success(`✓ 설정 저장됨: ${targets.join(", ")}\n`),
  );
  process.stdout.write(
    colors.info(
      `  LOCAL_LLM_MODEL_NAME=${model.modelName}\n`,
    ),
  );
  process.stdout.write(
    colors.info(
      `  LOCAL_LLM_MODEL_DIR=${modelsDir}\n`,
    ),
  );
  process.stdout.write(
    colors.info(
      `  LOCAL_LLM_MODEL_PATH=${modelFilePath}\n`,
    ),
  );
};

export const resetModelEnvFiles = (cwd: string = process.cwd()): string[] => {
  const targets = getModelEnvResetTargets(cwd);
  const changedTargets: string[] = [];

  for (const envPath of targets) {
    const changed = mutateEnvFile(envPath, removeModelEntries);
    if (changed) {
      changedTargets.push(envPath);
    }
  }

  return changedTargets;
};
