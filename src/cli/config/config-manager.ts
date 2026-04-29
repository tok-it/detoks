import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { DetoksConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

const getConfigDir = (): string => {
  return join(homedir(), ".detoks");
};

const getConfigPath = (): string => {
  return join(getConfigDir(), "settings.json");
};

export const loadConfig = (): DetoksConfig => {
  const configPath = getConfigPath();

  try {
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(content) as DetoksConfig;
      return parsed;
    }
  } catch {
    // 파일 읽기 실패 시 기본값 사용
  }

  // 파일이 없으면 기본값 반환 (저장하지 않음)
  return { ...DEFAULT_CONFIG };
};

export const saveConfig = (config: DetoksConfig): void => {
  const configDir = getConfigDir();
  const configPath = getConfigPath();

  // 디렉터리 생성
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // 타임스탬프 업데이트
  const updated = {
    ...config,
    lastUpdated: new Date().toISOString(),
  };

  writeFileSync(configPath, JSON.stringify(updated, null, 2), "utf-8");
};

export const updateAdapterModel = (
  adapter: "codex" | "gemini",
  model: string,
): void => {
  const config = loadConfig();
  config.adapter.models[adapter] = model;
  config.adapter.selected = adapter;
  saveConfig(config);
};

export const updateTranslationModel = (model: string): void => {
  const config = loadConfig();
  config.translation.model = model;
  saveConfig(config);
};

export const getAdapterModel = (adapter: "codex" | "gemini"): string | undefined => {
  const config = loadConfig();
  return config.adapter.models[adapter];
};

export const getTranslationModel = (): string | undefined => {
  const config = loadConfig();
  return config.translation.model;
};

export const getSelectedAdapter = (): "codex" | "gemini" => {
  const config = loadConfig();
  return config.adapter.selected;
};
