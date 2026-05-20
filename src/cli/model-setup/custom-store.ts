import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDetoksHomeDir } from "../../core/state/storage-paths.js";

interface StoredCustomModel {
  hfRepo: string;
  hfFile: string;
  quantization: string;
  sizeMb: number;
  savedAt: string;
}

const getStorePath = (): string =>
  join(getDetoksHomeDir(), "custom-models.json");

export const loadLastCustomModel = (): StoredCustomModel | null => {
  const path = getStorePath();
  if (!existsSync(path)) return null;

  try {
    const raw = readFileSync(path, "utf-8");
    const list = JSON.parse(raw) as StoredCustomModel[];
    return Array.isArray(list) && list.length > 0 ? (list[0] ?? null) : null;
  } catch {
    return null;
  }
};

export const saveCustomModel = (model: StoredCustomModel): void => {
  const path = getStorePath();
  mkdirSync(getDetoksHomeDir(), { recursive: true });

  const list: StoredCustomModel[] = [
    { ...model, savedAt: new Date().toISOString() },
  ];
  writeFileSync(path, JSON.stringify(list, null, 2), "utf-8");
};
