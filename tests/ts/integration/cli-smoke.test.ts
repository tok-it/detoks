import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const cliEntry = resolve(repoRoot, "src/cli/index.ts");

const runCli = (args: string[]) =>
  spawnSync(process.execPath, ["--import", "tsx", cliEntry, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });

describe("detoks CLI smoke", () => {
  it("keeps default stdout concise and verbose stdout full", () => {
    const defaultRun = runCli(["hello detoks"]);
    const verboseRun = runCli(["hello detoks", "--verbose"]);

    expect(defaultRun.error).toBeUndefined();
    expect(verboseRun.error).toBeUndefined();
    expect(defaultRun.status).toBe(0);
    expect(verboseRun.status).toBe(0);
    expect(defaultRun.stderr).toBe("");
    expect(verboseRun.stderr).toBe("");

    const defaultJson = JSON.parse(defaultRun.stdout.trim());
    const verboseJson = JSON.parse(verboseRun.stdout.trim());

    expect(defaultJson).toEqual({
      ok: true,
      mode: "run",
      adapter: "codex",
      summary: "All 1 task(s) completed",
      nextAction: "Pipeline complete",
    });
    expect(defaultJson).not.toHaveProperty("stages");
    expect(defaultJson).not.toHaveProperty("rawOutput");

    expect(verboseJson).toMatchObject({
      ok: true,
      mode: "run",
      adapter: "codex",
      summary: "All 1 task(s) completed",
      nextAction: "Pipeline complete",
      rawOutput:
        "[stub:codex] [EXECUTE] hello detoks\n\nContext: No previous task context available.",
    });
    expect(verboseJson.stages).toHaveLength(5);
    expect(verboseJson).toHaveProperty("rawOutput");
    expect(verboseRun.stdout).not.toBe(defaultRun.stdout);
  });

  it("keeps default stderr concise and verbose stderr stacked on errors", () => {
    const defaultRun = runCli(["--unknown"]);
    const verboseRun = runCli(["--unknown", "--verbose"]);

    expect(defaultRun.error).toBeUndefined();
    expect(verboseRun.error).toBeUndefined();
    expect(defaultRun.status).toBe(1);
    expect(verboseRun.status).toBe(1);
    expect(defaultRun.stdout).toBe("");
    expect(verboseRun.stdout).toBe("");

    const defaultJson = JSON.parse(defaultRun.stderr.trim());
    const verboseJson = JSON.parse(verboseRun.stderr.trim());

    expect(defaultJson).toEqual({
      ok: false,
      error: "Unknown flag: --unknown. Run `detoks --help` for usage.",
    });
    expect(defaultJson).not.toHaveProperty("stack");

    expect(verboseJson).toMatchObject({
      ok: false,
      error: "Unknown flag: --unknown. Run `detoks --help` for usage.",
    });
    expect(verboseJson.stack).toContain("Unknown flag: --unknown");
    expect(verboseRun.stderr).not.toBe(defaultRun.stderr);
  });
});
