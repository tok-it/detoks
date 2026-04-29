import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { TranslationModel } from "./models.js";
import { colors } from "../colors.js";

const getModelsDir = () => join(homedir(), ".detoks", "models");

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

export const updateEnvFile = (model: TranslationModel, cwd: string = process.cwd()): void => {
  const envPath = join(cwd, ".env");
  let content: string;

  try {
    content = readFileSync(envPath, "utf-8");
  } catch {
    // .env 파일이 없으면 생성
    content = "";
  }

  const entries = parseEnvFile(content);

  // 기존 값 업데이트 또는 새로 추가
  const updateEntry = (key: string, value: string) => {
    const existingIndex = entries.findIndex((e) => e.key === key);
    if (existingIndex >= 0) {
      const entry = entries[existingIndex];
      if (entry) {
        entry.value = value;
      }
    } else {
      entries.push({ key, value });
    }
  };

  const modelsDir = getModelsDir();
  const modelFilePath = join(modelsDir, model.hfFile);

  updateEntry("LOCAL_LLM_MODEL_NAME", model.modelName);
  updateEntry("LOCAL_LLM_MODEL_DIR", modelsDir);
  updateEntry("LOCAL_LLM_MODEL_PATH", modelFilePath);
  updateEntry("LOCAL_LLM_HF_REPO", `${model.hfRepo}:Q4_K_S`);
  updateEntry("LOCAL_LLM_HF_FILE", model.hfFile);

  const updatedContent = serializeEnvFile(entries);
  writeFileSync(envPath, updatedContent, "utf-8");

  process.stdout.write(
    colors.success(`✓ 설정 저장됨: ${envPath}\n`),
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
