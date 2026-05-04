import { execSync } from "node:child_process";

export interface ClaudeLoginStatus {
  authenticated: boolean;
  authType: string | undefined;
  apiProvider: string | undefined;
}

export const getClaudeLoginStatus = (): ClaudeLoginStatus => {
  try {
    const output = execSync("claude auth status --json 2>&1", { encoding: "utf-8" }).trim();
    const status = JSON.parse(output) as {
      loggedIn?: boolean;
      authMethod?: string;
      apiProvider?: string;
    };

    return {
      authenticated: Boolean(status.loggedIn),
      authType: status.loggedIn
        ? [status.authMethod, status.apiProvider].filter(Boolean).join(" / ") || "authenticated"
        : undefined,
      apiProvider: status.apiProvider,
    };
  } catch {
    return {
      authenticated: false,
      authType: undefined,
      apiProvider: undefined,
    };
  }
};

export interface ClaudeModel {
  slug: string;
  display_name: string;
}

export const getClaudeAvailableModels = (): ClaudeModel[] => [];

export const claudeLogout = (): boolean => {
  try {
    execSync("claude auth logout 2>&1", { encoding: "utf-8" });
    return true;
  } catch {
    return false;
  }
};
