import { dirname, resolve } from "node:path";

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
