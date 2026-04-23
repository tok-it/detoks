import type { Adapter } from "../../core/pipeline/types.js";

const truncatePrompt = (prompt: string): string =>
  prompt.length > 96 ? `${prompt.slice(0, 93)}...` : prompt;

export const buildStubRawOutput = (adapter: Adapter, prompt: string): string =>
  `[stub:${adapter}] ${truncatePrompt(prompt)}`;
