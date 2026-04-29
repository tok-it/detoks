import { execSync } from "node:child_process";

export interface CodexModel {
  slug: string;
  display_name: string;
}

export interface CodexLoginStatus {
  authenticated: boolean;
  account?: string;
}

export const getCodexLoginStatus = (): CodexLoginStatus => {
  try {
    const output = execSync("codex login status 2>&1", { encoding: "utf-8" }).trim();
    if (output.toLowerCase().includes("logged in")) {
      return {
        authenticated: true,
        account: output.replace(/^Logged in using\s+/, "").trim(),
      };
    }
    return { authenticated: false };
  } catch {
    return { authenticated: false };
  }
};

export const getCodexAvailableModels = (): CodexModel[] => {
  try {
    const output = execSync("codex debug models 2>&1", { encoding: "utf-8" });
    const data = JSON.parse(output);
    return (data.models || [])
      .filter((m: { visibility?: string }) => m.visibility === "list")
      .slice(0, 10)
      .map((m: CodexModel) => ({
        slug: m.slug,
        display_name: m.display_name,
      }));
  } catch {
    return [];
  }
};
