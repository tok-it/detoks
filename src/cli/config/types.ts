export interface DetoksConfig {
  version: string;
  lastUpdated: string;
  adapter: {
    selected: "codex" | "gemini";
    models: {
      codex: string | undefined;
      gemini: string | undefined;
    };
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
    },
  },
  translation: {
    model: undefined,
  },
};
