import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DEFAULT_LAYOUT_SCHEMA, type PanelDef } from "./layout-manager.js";
import { resolveProjectDataDir } from "../../core/state/storage-paths.js";

const OVERRIDES_FILENAME = "layout-overrides.json";
const MIN_FLEX_WEIGHT = 1;
const MAX_FLEX_WEIGHT = 99;

/** User-adjustable flex weights for the two main content panels. */
export interface RuntimeLayoutOverrides {
  transcriptWeight?: number;
  resultWeight?: number;
}

export const isEmptyOverrides = (overrides: RuntimeLayoutOverrides): boolean =>
  overrides.transcriptWeight === undefined && overrides.resultWeight === undefined;

const clampWeight = (value: number): number => {
  if (!Number.isFinite(value)) return MIN_FLEX_WEIGHT;
  return Math.min(MAX_FLEX_WEIGHT, Math.max(MIN_FLEX_WEIGHT, Math.floor(value)));
};

/**
 * Returns a new schema with transcript/result weights replaced when overrides
 * specify them. Other panels are passed through untouched.
 */
export const applyLayoutOverrides = (
  schema: readonly PanelDef[],
  overrides: RuntimeLayoutOverrides,
): readonly PanelDef[] => {
  if (isEmptyOverrides(overrides)) return schema;
  return schema.map((panel) => {
    if (panel.id === "transcript" && overrides.transcriptWeight !== undefined) {
      return { ...panel, weight: clampWeight(overrides.transcriptWeight) };
    }
    if (panel.id === "result" && overrides.resultWeight !== undefined) {
      return { ...panel, weight: clampWeight(overrides.resultWeight) };
    }
    return panel;
  });
};

export type LayoutCommandAction =
  | { kind: "reset" }
  | { kind: "set"; transcriptWeight?: number; resultWeight?: number }
  | { kind: "shift"; transcriptDelta: number }
  | { kind: "show" }
  | { kind: "unknown"; arg: string };

/**
 * Parses /layout command args. Examples:
 *   /layout                  → show current
 *   /layout reset            → restore default 7/3 split
 *   /layout transcript=8     → transcript=8 (result inferred from current)
 *   /layout transcript=8 result=2
 *   /layout result=4         → result=4 (transcript inferred)
 *   /layout +                → transcript += 1, result -= 1 (shift toward transcript)
 *   /layout -                → transcript -= 1, result += 1 (shift toward result)
 */
export const parseLayoutCommand = (args: readonly string[]): LayoutCommandAction => {
  if (args.length === 0) return { kind: "show" };

  const first = args[0]?.toLowerCase() ?? "";
  if (first === "reset" || first === "default") return { kind: "reset" };
  if (first === "+" || first === "up") return { kind: "shift", transcriptDelta: 1 };
  if (first === "-" || first === "down") return { kind: "shift", transcriptDelta: -1 };

  const result: { kind: "set"; transcriptWeight?: number; resultWeight?: number } = { kind: "set" };
  let matched = false;
  for (const arg of args) {
    const [rawKey, rawValue] = arg.split("=");
    if (!rawKey || rawValue === undefined) continue;
    const key = rawKey.trim().toLowerCase();
    const value = Number(rawValue.trim());
    if (!Number.isFinite(value)) continue;
    if (key === "transcript" || key === "t") {
      result.transcriptWeight = clampWeight(value);
      matched = true;
    } else if (key === "result" || key === "r") {
      result.resultWeight = clampWeight(value);
      matched = true;
    }
  }
  if (!matched) {
    return { kind: "unknown", arg: args.join(" ") };
  }
  return result;
};

/** Convert a shift delta into next absolute overrides given current state. */
export const computeShiftedOverrides = (
  current: RuntimeLayoutOverrides,
  transcriptDelta: number,
  defaults: { transcriptWeight: number; resultWeight: number } = {
    transcriptWeight: 7,
    resultWeight: 3,
  },
): RuntimeLayoutOverrides => {
  const baseT = current.transcriptWeight ?? defaults.transcriptWeight;
  const baseR = current.resultWeight ?? defaults.resultWeight;
  return {
    transcriptWeight: clampWeight(baseT + transcriptDelta),
    resultWeight: clampWeight(baseR - transcriptDelta),
  };
};

/** Derives current effective weights from DEFAULT_LAYOUT_SCHEMA + overrides. */
export const getEffectiveWeights = (
  overrides: RuntimeLayoutOverrides,
  schema: readonly PanelDef[] = DEFAULT_LAYOUT_SCHEMA,
): { transcriptWeight: number; resultWeight: number } => {
  const transcript = schema.find((p) => p.id === "transcript");
  const result = schema.find((p) => p.id === "result");
  return {
    transcriptWeight: overrides.transcriptWeight ?? transcript?.weight ?? 7,
    resultWeight: overrides.resultWeight ?? result?.weight ?? 3,
  };
};

export const resolveLayoutOverridesPath = (
  cwd: string = process.cwd(),
): string => join(resolveProjectDataDir(cwd), OVERRIDES_FILENAME);

export const loadLayoutOverrides = async (
  filePath: string,
): Promise<RuntimeLayoutOverrides> => {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as Partial<RuntimeLayoutOverrides>;
    const overrides: RuntimeLayoutOverrides = {};
    if (typeof parsed.transcriptWeight === "number") {
      overrides.transcriptWeight = clampWeight(parsed.transcriptWeight);
    }
    if (typeof parsed.resultWeight === "number") {
      overrides.resultWeight = clampWeight(parsed.resultWeight);
    }
    return overrides;
  } catch {
    return {};
  }
};

export const saveLayoutOverrides = async (
  filePath: string,
  overrides: RuntimeLayoutOverrides,
): Promise<void> => {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(overrides, null, 2) + "\n", "utf-8");
};
