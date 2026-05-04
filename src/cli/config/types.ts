import type { Adapter } from "../../core/pipeline/types.js";

export const CODEX_REASONING_EFFORT_VALUES = ["low", "medium", "high", "xhigh"] as const;
export type CodexReasoningEffort = (typeof CODEX_REASONING_EFFORT_VALUES)[number];

export interface DetoksConfig {
  version: string;
  lastUpdated: string;
  runtime?: {
    lastSeenReleaseVersion?: string;
  };
  adapter: {
    selected: Adapter;
    models: Record<Adapter, string | undefined>;
    codexReasoningEffort?: CodexReasoningEffort;
  };
  translation: {
    model: string | undefined;
  };
}

export const DEFAULT_CONFIG: DetoksConfig = {
  version: "1.0",
  lastUpdated: new Date().toISOString(),
  adapter: {
    selected: "codex",
    models: {
      codex: undefined,
      gemini: undefined,
      "claude": undefined,
    },
  },
  translation: {
    model: undefined,
  },
};
