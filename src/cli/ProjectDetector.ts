import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ProjectInfo } from "../core/state/SessionStateManager.js";

const execFileAsync = promisify(execFile);

export interface DetectedProject extends ProjectInfo {}

export class ProjectDetector {
  static async detect(cwd: string = process.cwd()): Promise<DetectedProject> {
    const projectPath = path.resolve(cwd);
    const gitProjectId = await this.extractGitProjectId(projectPath);
    const packageProjectName = await this.extractPackageProjectName(projectPath);
    const fallbackProjectName = this.getFallbackProjectName(projectPath);

    return {
      projectId: gitProjectId ?? packageProjectName ?? "default",
      projectPath,
      projectName: packageProjectName ?? fallbackProjectName,
    };
  }

  private static async extractGitProjectId(cwd: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["config", "--get", "remote.origin.url"],
        { cwd, encoding: "utf8" },
      );
      const url = stdout.trim();
      if (!url) {
        return null;
      }

      const hash = createHash("md5").update(url).digest("hex");
      return `git-${hash.slice(0, 12)}`;
    } catch {
      return null;
    }
  }

  private static async extractPackageProjectName(cwd: string): Promise<string | null> {
    try {
      const packageJsonPath = path.join(cwd, "package.json");
      const data = await readFile(packageJsonPath, "utf8");
      const parsed = JSON.parse(data) as { name?: unknown };
      return typeof parsed.name === "string" && parsed.name.trim().length > 0
        ? parsed.name.trim()
        : null;
    } catch {
      return null;
    }
  }

  private static getFallbackProjectName(cwd: string): string {
    return path.basename(cwd);
  }
}
