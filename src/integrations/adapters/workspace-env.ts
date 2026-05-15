import { dirname, resolve } from "node:path";
import type { Adapter } from "../../core/pipeline/types.js";

export const buildWorkspaceIsolationEnv = (
  cwd?: string,
): Record<string, string> | undefined => {
  if (!cwd) {
    return undefined;
  }

  const resolvedCwd = resolve(cwd);
  return {
    GIT_CEILING_DIRECTORIES: dirname(resolvedCwd),
  };
};


export const buildWorkspaceCommandArgs = (
  adapter: Adapter,
  cwd?: string,
): string[] => {
  if (!cwd) {
    return [];
  }

  if (adapter === "codex") {
    return ["-C", cwd];
  }

  return [];
};
