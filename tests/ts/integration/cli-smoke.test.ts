import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

const runCliWithEnvAndTimeout = (
  args: string[],
  env: NodeJS.ProcessEnv,
  timeout: number,
) =>
  spawnSync(process.execPath, ["--import", "tsx", cliEntry, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
    timeout,
  });

const findInstalledBinary = (command: "codex" | "gemini"): string | undefined => {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  return result.status === 0 && result.stdout.trim().length > 0
    ? result.stdout.trim()
    : undefined;
};

const installedRealAdapter =
  findInstalledBinary("codex") !== undefined
    ? "codex"
    : findInstalledBinary("gemini") !== undefined
      ? "gemini"
      : undefined;
const realBinarySmoke = process.env.DETOKS_REAL_BINARY_SMOKE === "1" && installedRealAdapter
  ? it
  : it.skip;

const createFakeBinary = (
  dir: string,
  command: "codex" | "gemini",
  options: { exitCode?: number; stderr?: string } = {},
) => {
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
  ${options.stderr ? `process.stderr.write(${JSON.stringify(options.stderr)});` : ""}
  process.stdout.write(\`[fake:${command}] \${input}\`);
  process.exit(${options.exitCode ?? 0});
});
`,
    "utf8",
  );
  chmodSync(binaryPath, 0o755);
  return binaryPath;
};

const runAdapterRawOutputSmoke = (adapter: "codex" | "gemini", prompt: string) => {
  const tempDir = mkdtempSync(join(tmpdir(), "detoks-cli-real-"));

  try {
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
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
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
    const tempDir = mkdtempSync(join(tmpdir(), "detoks-cli-batch-"));
    const inputFile = join(tempDir, "input.json");

    try {
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
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("prints explicit checkpoint list JSON for empty and populated sessions", () => {
    const sessionId = `session_cli_smoke_${Date.now()}`;
    const checkpointId = `${sessionId}_checkpoint_001`;
    const checkpointDir = join(repoRoot, ".state", "checkpoints");
    const checkpointPath = join(checkpointDir, `${checkpointId}.json`);

    try {
      const emptyRun = runCli(["checkpoint", "list", sessionId]);

      expect(emptyRun.error).toBeUndefined();
      expect(emptyRun.status).toBe(0);
      expect(emptyRun.stderr).toBe("");
      expect(JSON.parse(emptyRun.stdout.trim())).toEqual({
        ok: true,
        mode: "checkpoint-list",
        sessionId,
        hasCheckpoints: false,
        checkpointCount: 0,
        message: `No checkpoints found for session ${sessionId}.`,
        checkpoints: [],
      });

      mkdirSync(checkpointDir, { recursive: true });
      writeFileSync(
        checkpointPath,
        JSON.stringify({
          id: checkpointId,
          title: "Smoke checkpoint",
          task_id: "task_001",
          summary: "Smoke summary",
          changed_files: ["src/cli/commands/checkpoint-list.ts"],
          next_action: "Review stdout contract",
          created_at: "2026-04-27T00:00:00.000Z",
        }),
        "utf8",
      );

      const populatedRun = runCli(["checkpoint", "list", sessionId]);

      expect(populatedRun.error).toBeUndefined();
      expect(populatedRun.status).toBe(0);
      expect(populatedRun.stderr).toBe("");
      expect(JSON.parse(populatedRun.stdout.trim())).toEqual({
        ok: true,
        mode: "checkpoint-list",
        sessionId,
        hasCheckpoints: true,
        checkpointCount: 1,
        message: `1 checkpoint(s) found for session ${sessionId}.`,
        checkpoints: [
          {
            id: checkpointId,
            title: "Smoke checkpoint",
            taskId: "task_001",
            createdAt: "2026-04-27T00:00:00.000Z",
            changedFiles: ["src/cli/commands/checkpoint-list.ts"],
            nextAction: "Review stdout contract",
          },
        ],
      });
    } finally {
      rmSync(checkpointPath, { force: true });
    }
  });

  it("prints explicit checkpoint show JSON for a saved checkpoint", () => {
    const checkpointId = `session_cli_smoke_${Date.now()}_checkpoint_001`;
    const checkpointDir = join(repoRoot, ".state", "checkpoints");
    const checkpointPath = join(checkpointDir, `${checkpointId}.json`);

    try {
      mkdirSync(checkpointDir, { recursive: true });
      writeFileSync(
        checkpointPath,
        JSON.stringify({
          id: checkpointId,
          title: "Smoke checkpoint",
          task_id: "task_001",
          summary: "Smoke summary",
          changed_files: ["src/cli/commands/checkpoint-show.ts"],
          next_action: "Review checkpoint show stdout contract",
          created_at: "2026-04-27T00:00:00.000Z",
        }),
        "utf8",
      );

      const showRun = runCli(["checkpoint", "show", checkpointId]);

      expect(showRun.error).toBeUndefined();
      expect(showRun.status).toBe(0);
      expect(showRun.stderr).toBe("");
      expect(JSON.parse(showRun.stdout.trim())).toEqual({
        ok: true,
        mode: "checkpoint-show",
        checkpoint: {
          id: checkpointId,
          title: "Smoke checkpoint",
          taskId: "task_001",
          createdAt: "2026-04-27T00:00:00.000Z",
          changedFiles: ["src/cli/commands/checkpoint-show.ts"],
          nextAction: "Review checkpoint show stdout contract",
        },
      });
    } finally {
      rmSync(checkpointPath, { force: true });
    }
  });

  it("keeps codex real rawOutput distinct from stub rawOutput in smoke mode", () => {
    runAdapterRawOutputSmoke("codex", "hello detoks");
  });

  it("keeps gemini real rawOutput distinct from stub rawOutput in smoke mode", () => {
    runAdapterRawOutputSmoke("gemini", "hello gemini");
  });

  realBinarySmoke(
    "runs the real execution contract against an installed codex/gemini binary when opted in",
    () => {
      const adapter = installedRealAdapter;
      expect(adapter).toBeDefined();

      const realRun = runCliWithEnvAndTimeout(
        [
          "detoks installed binary smoke",
          "--adapter",
          adapter!,
          "--execution-mode",
          "real",
          "--verbose",
        ],
        {},
        15_000,
      );

      expect(realRun.error).toBeUndefined();
      expect(realRun.status).toBe(0);
      expect(realRun.stderr).toBe("");

      const realJson = JSON.parse(realRun.stdout.trim());
      expect(realJson).toMatchObject({
        ok: true,
        mode: "run",
        adapter,
      });
      expect(realJson).toHaveProperty("rawOutput");
      expect(realJson.rawOutput).not.toContain(`[fake:${adapter}]`);
      expect(realJson.rawOutput).not.toContain(`[stub:${adapter}]`);
    },
  );

  it("prints real non-zero run results to stderr and exits 1", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "detoks-cli-real-fail-"));

    try {
      createFakeBinary(tempDir, "codex", {
        exitCode: 42,
        stderr: "[fake:codex] boom\n",
      });

      const failedRun = runCliWithEnv(
        ["please fail", "--execution-mode", "real"],
        {
          PATH: `${tempDir}:${process.env.PATH ?? ""}`,
        },
      );
      const failedVerboseRun = runCliWithEnv(
        ["please fail", "--execution-mode", "real", "--verbose"],
        {
          PATH: `${tempDir}:${process.env.PATH ?? ""}`,
        },
      );

      expect(failedRun.error).toBeUndefined();
      expect(failedRun.status).toBe(1);
      expect(failedRun.stdout).toBe("");

      const failedJson = JSON.parse(failedRun.stderr.trim());
      expect(failedJson).toMatchObject({
        ok: false,
        error: "0/1 task(s) completed — 1 failed",
      });
      expect(failedJson).toHaveProperty("rawOutput");
      expect(failedJson.rawOutput).toContain("[fake:codex] [VALIDATE] fail");

      expect(failedVerboseRun.error).toBeUndefined();
      expect(failedVerboseRun.status).toBe(1);
      expect(failedVerboseRun.stdout).toBe("");
      
      const failedVerboseJson = JSON.parse(failedVerboseRun.stderr.trim());
      expect(failedVerboseJson).toMatchObject({
        ok: false,
        summary: "0/1 task(s) completed — 1 failed",
      });
      expect(failedVerboseJson).toHaveProperty("rawOutput");
      expect(failedVerboseJson.rawOutput).toContain("[fake:codex] [VALIDATE]");
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("keeps codex real rawOutput distinct from stub rawOutput in smoke mode", () => {
    runAdapterRawOutputSmoke("codex", "hello detoks");
  });

  it("keeps gemini real rawOutput distinct from stub rawOutput in smoke mode", () => {
    runAdapterRawOutputSmoke("gemini", "hello gemini");
  });
});
