import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProjectDetector } from "../../../../src/cli/ProjectDetector.js";

describe("ProjectDetector", () => {
  it("prefers a git remote hash for projectId and package.json name for projectName", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "detoks-project-detector-"));

    try {
      writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "detoks-test-app" }), "utf8");
      execFileSync("git", ["init"], { cwd, stdio: "ignore" });
      execFileSync("git", ["remote", "add", "origin", "https://github.com/example/detoks.git"], {
        cwd,
        stdio: "ignore",
      });

      const detected = await ProjectDetector.detect(cwd);
      const expectedProjectId = `git-${createHash("md5")
        .update("https://github.com/example/detoks.git")
        .digest("hex")
        .slice(0, 12)}`;

      expect(detected).toEqual({
        projectId: expectedProjectId,
        projectPath: cwd,
        projectName: "detoks-test-app",
      });
    } finally {
      rmSync(cwd, { force: true, recursive: true });
    }
  });

  it("falls back to package name for projectId when git remote is missing", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "detoks-project-detector-"));

    try {
      writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "package-only-app" }), "utf8");

      await expect(ProjectDetector.detect(cwd)).resolves.toEqual({
        projectId: "package-only-app",
        projectPath: cwd,
        projectName: "package-only-app",
      });
    } finally {
      rmSync(cwd, { force: true, recursive: true });
    }
  });

  it("falls back to the directory name when neither git nor package metadata exists", async () => {
    const parent = mkdtempSync(join(tmpdir(), "detoks-project-detector-"));
    const cwd = join(parent, "fallback-app");

    try {
      mkdirSync(cwd);

      await expect(ProjectDetector.detect(cwd)).resolves.toEqual({
        projectId: "default",
        projectPath: cwd,
        projectName: "fallback-app",
      });
    } finally {
      rmSync(parent, { force: true, recursive: true });
    }
  });
});
