import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const cliEntry = resolve(repoRoot, "src/cli/index.ts");
const tempDirs: string[] = [];

const createTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "detoks-cli-smoke-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const runCli = (args: string[], envOverrides: NodeJS.ProcessEnv = {}) =>
  spawnSync(process.execPath, ["--import", "tsx", cliEntry, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...envOverrides,
    },
  });

const runCliWithInput = (
  args: string[],
  input: string,
  envOverrides: NodeJS.ProcessEnv = {},
) =>
  spawnSync(process.execPath, ["--import", "tsx", cliEntry, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    input,
    env: {
      ...process.env,
      ...envOverrides,
    },
  });

const createFakeBinaryDir = (name: string, stdout: string): string => {
  const dir = createTempDir();
  const binaryPath = join(dir, name);
    writeFileSync(
      binaryPath,
      [
        "#!/bin/sh",
        `printf '%s' ${JSON.stringify(stdout)}`,
        "exit 0",
        "",
      ].join("\n"),
      "utf8",
  );
  chmodSync(binaryPath, 0o755);
  return dir;
};

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

  it("shows start and close messages for repl in default mode", () => {
    const replRun = runCliWithInput(["repl"], "exit\n");

    expect(replRun.error).toBeUndefined();
    expect(replRun.status).toBe(0);
    expect(replRun.stderr).toBe("");
    expect(replRun.stdout).toContain("detoks repl started");
    expect(replRun.stdout).toContain("executionMode=stub");
    expect(replRun.stdout).toContain("verbose=false");
    expect(replRun.stdout).toContain('type "exit" to quit.');
    expect(replRun.stdout).toContain("detoks> ");
    expect(replRun.stdout.trimEnd()).toMatch(/detoks repl closed\.$/);
  });

  it("shows verbose=true in repl start message for verbose mode", () => {
    const replRun = runCliWithInput(["repl", "--verbose"], "exit\n");

    expect(replRun.error).toBeUndefined();
    expect(replRun.status).toBe(0);
    expect(replRun.stderr).toBe("");
    expect(replRun.stdout).toContain("detoks repl started");
    expect(replRun.stdout).toContain("executionMode=stub");
    expect(replRun.stdout).toContain("verbose=true");
    expect(replRun.stdout).toContain('type "exit" to quit.');
    expect(replRun.stdout).toContain("detoks> ");
    expect(replRun.stdout.trimEnd()).toMatch(/detoks repl closed\.$/);
  });

  it("uses the real subprocess rawOutput contract when execution-mode=real", () => {
    const fakeBinDir = createFakeBinaryDir("codex", "[fake:codex] hello detoks");
    const env = {
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`,
    };

    const stubRun = runCli(["hello detoks", "--verbose"], env);
    const realRun = runCli(
      ["hello detoks", "--execution-mode", "real", "--verbose"],
      env,
    );

    expect(stubRun.error).toBeUndefined();
    expect(realRun.error).toBeUndefined();
    expect(stubRun.status).toBe(0);
    expect(realRun.status).toBe(0);
    expect(stubRun.stderr).toBe("");
    expect(realRun.stderr).toBe("");

    const stubJson = JSON.parse(stubRun.stdout.trim());
    const realJson = JSON.parse(realRun.stdout.trim());

    expect(stubJson.rawOutput).toBe(
      "[stub:codex] [EXECUTE] hello detoks\n\nContext: No previous task context available.",
    );
    expect(realJson.rawOutput).toBe("[fake:codex] hello detoks");
    expect(realJson.rawOutput).not.toBe(stubJson.rawOutput);
  });
});
