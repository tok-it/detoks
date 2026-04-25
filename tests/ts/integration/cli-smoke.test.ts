import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const cliEntry = resolve(repoRoot, "src/cli/index.ts");

const runCli = (args: string[]) =>
  spawnSync(process.execPath, ["--import", "tsx", cliEntry, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });

const runCliWithInput = (args: string[], input: string) =>
  spawnSync(process.execPath, ["--import", "tsx", cliEntry, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    input,
  });

const runCliWithEnv = (args: string[], env: NodeJS.ProcessEnv) =>
  spawnSync(process.execPath, ["--import", "tsx", cliEntry, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });

const createFakeBinary = (dir: string, command: "codex" | "gemini") => {
  const binaryPath = join(dir, command);
  writeFileSync(
    binaryPath,
    `#!/usr/bin/env node
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  process.stdout.write(\`[fake:${command}] \${input}\`);
});
`,
    "utf8",
  );
  chmodSync(binaryPath, 0o755);
  return binaryPath;
};

const runAdapterRawOutputSmoke = (adapter: "codex" | "gemini", prompt: string) => {
  const tempDir = mkdtempSync(join(tmpdir(), "detoks-cli-real-"));
  createFakeBinary(tempDir, adapter);

  const stubRun = runCli([prompt, "--adapter", adapter, "--verbose"]);
  const realRun = runCliWithEnv(
    [prompt, "--adapter", adapter, "--execution-mode", "real", "--verbose"],
    {
      PATH: `${tempDir}:${process.env.PATH ?? ""}`,
    },
  );

  expect(stubRun.error).toBeUndefined();
  expect(realRun.error).toBeUndefined();
  expect(stubRun.status).toBe(0);
  expect(realRun.status).toBe(0);
  expect(stubRun.stderr).toBe("");
  expect(realRun.stderr).toBe("");

  const stubJson = JSON.parse(stubRun.stdout.trim());
  const realJson = JSON.parse(realRun.stdout.trim());

  expect(stubJson).toMatchObject({
    ok: true,
    mode: "run",
    adapter,
  });
  expect(stubJson.rawOutput).toContain(`[stub:${adapter}] [EXECUTE] ${prompt}`);
  expect(realJson).toMatchObject({
    ok: true,
    mode: "run",
    adapter,
  });
  expect(realJson.rawOutput).toContain(`[fake:${adapter}] [EXECUTE] ${prompt}`);
  expect(realJson.rawOutput).not.toBe(stubJson.rawOutput);
  expect(realJson).toHaveProperty("rawOutput");
  expect(realRun.stdout).not.toBe(stubRun.stdout);
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

  it("runs batch file input and keeps default stdout concise", () => {
    const tempDir = mkdtempSync(join(repoRoot, "tmp-cli-batch-"));
    const inputFile = join(tempDir, "input.json");
    writeFileSync(
      inputFile,
      JSON.stringify({
        data: ["Please create a new file", "Please run npm test"],
      }),
      "utf8",
    );

    const defaultRun = runCli(["--file", inputFile]);
    const verboseRun = runCli(["--file", inputFile, "--verbose"]);

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
      mode: "batch",
      inputCount: 2,
      completedCount: 2,
      failedCount: 0,
    });
    expect(verboseJson.run_metadata.input_count).toBe(2);
    expect(verboseJson.results).toHaveLength(2);
    expect(verboseJson.results[0].compiled_prompt).toBe("Create a new file");
    expect(verboseJson.results[1].compiled_prompt).toBe("Run npm test");
  });

  it("keeps codex real rawOutput distinct from stub rawOutput in smoke mode", () => {
    runAdapterRawOutputSmoke("codex", "hello detoks");
  });

  it("keeps gemini real rawOutput distinct from stub rawOutput in smoke mode", () => {
    runAdapterRawOutputSmoke("gemini", "hello gemini");
  });
});
