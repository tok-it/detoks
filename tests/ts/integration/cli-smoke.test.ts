import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";

const repoRoot = process.cwd();
const cliEntry = resolve(repoRoot, "src/cli/index.ts");
const tsxLoader = resolve(repoRoot, "node_modules/tsx/dist/loader.mjs");
const tsxLoaderUrl = pathToFileURL(tsxLoader).href;
const repoReplRegistryPath = join(repoRoot, ".repl-session.json");

vi.setConfig({ testTimeout: 30_000 });

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

const runCliFromCwd = (cwd: string, args: string[]) =>
  spawnSync(process.execPath, ["--import", tsxLoaderUrl, cliEntry, ...args], {
    cwd,
    encoding: "utf8",
  });

const runCliWithInputFromCwd = (cwd: string, args: string[], input: string) =>
  spawnSync(process.execPath, ["--import", tsxLoaderUrl, cliEntry, ...args], {
    cwd,
    encoding: "utf8",
    input,
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

const installedRealAdapters: Array<"codex" | "gemini"> = (["codex", "gemini"] as const).filter(
  (command) => findInstalledBinary(command) !== undefined,
);
const requestedRealBinarySmokeAdapter =
  process.env.DETOKS_REAL_BINARY_SMOKE_ADAPTER === "codex" ||
  process.env.DETOKS_REAL_BINARY_SMOKE_ADAPTER === "gemini"
    ? process.env.DETOKS_REAL_BINARY_SMOKE_ADAPTER
    : undefined;
const runAllRealBinarySmokeTargets = process.env.DETOKS_REAL_BINARY_SMOKE_ALL === "1";
const realBinarySmokeTargets: Array<"codex" | "gemini"> = runAllRealBinarySmokeTargets
  ? installedRealAdapters
  : requestedRealBinarySmokeAdapter
    ? installedRealAdapters.includes(requestedRealBinarySmokeAdapter)
      ? [requestedRealBinarySmokeAdapter]
      : []
    : installedRealAdapters[0]
      ? [installedRealAdapters[0]]
      : [];
const realBinarySmokePrompt =
  process.env.DETOKS_REAL_BINARY_SMOKE_PROMPT ?? "detoks installed binary smoke";
const parsedRealBinarySmokeTimeoutMs = Number.parseInt(
  process.env.DETOKS_REAL_BINARY_SMOKE_TIMEOUT_MS ?? "",
  10,
);
const realBinarySmokeTimeoutMs =
  Number.isFinite(parsedRealBinarySmokeTimeoutMs) && parsedRealBinarySmokeTimeoutMs > 0
    ? parsedRealBinarySmokeTimeoutMs
    : 15_000;
const realBinarySmoke = process.env.DETOKS_REAL_BINARY_SMOKE === "1" && realBinarySmokeTargets.length > 0
  ? it
  : it.skip;
const liveLocalLlmSmokePrompt =
  process.env.DETOKS_LIVE_LOCAL_LLM_SMOKE_PROMPT ?? "새 파일을 생성해";
const liveLocalLlmSmokeApiBase = process.env.DETOKS_LIVE_LOCAL_LLM_API_BASE;
const liveLocalLlmSmokeApiKey = process.env.DETOKS_LIVE_LOCAL_LLM_API_KEY;
const liveLocalLlmSmokeModelName = process.env.DETOKS_LIVE_LOCAL_LLM_MODEL_NAME;
const parsedLiveLocalLlmSmokeTimeoutMs = Number.parseInt(
  process.env.DETOKS_LIVE_LOCAL_LLM_TIMEOUT_MS ?? "",
  10,
);
const liveLocalLlmSmokeTimeoutMs =
  Number.isFinite(parsedLiveLocalLlmSmokeTimeoutMs) && parsedLiveLocalLlmSmokeTimeoutMs > 0
    ? parsedLiveLocalLlmSmokeTimeoutMs
    : 20_000;
const liveLocalLlmSmoke =
  process.env.DETOKS_LIVE_LOCAL_LLM_SMOKE === "1" &&
  liveLocalLlmSmokeApiBase &&
  liveLocalLlmSmokeModelName
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

const runInstalledRealAdapterSmoke = (adapter: "codex" | "gemini") => {
  const defaultRun = runCliWithEnvAndTimeout(
    [
      realBinarySmokePrompt,
      "--adapter",
      adapter,
      "--execution-mode",
      "real",
    ],
    {},
    realBinarySmokeTimeoutMs,
  );
  const verboseRun = runCliWithEnvAndTimeout(
    [
      realBinarySmokePrompt,
      "--adapter",
      adapter,
      "--execution-mode",
      "real",
      "--verbose",
    ],
    {},
    realBinarySmokeTimeoutMs,
  );

  expect(defaultRun.error).toBeUndefined();
  expect(verboseRun.error).toBeUndefined();
  expect(defaultRun.status).toBe(0);
  expect(verboseRun.status).toBe(0);
  expect(defaultRun.stderr).toBe("");
  expect(verboseRun.stderr).toBe("");

  const defaultJson = JSON.parse(defaultRun.stdout.trim());
  const verboseJson = JSON.parse(verboseRun.stdout.trim());

  expect(defaultJson).toMatchObject({
    ok: true,
    mode: "run",
    adapter,
  });
  expect(defaultJson).toHaveProperty("summary");
  expect(defaultJson).toHaveProperty("nextAction");
  expect(defaultJson).not.toHaveProperty("rawOutput");

  expect(verboseJson).toMatchObject({
    ok: true,
    mode: "run",
    adapter,
  });
  expect(verboseJson).toHaveProperty("rawOutput");
  expect(verboseJson.rawOutput).not.toContain(`[fake:${adapter}]`);
  expect(verboseJson.rawOutput).not.toContain(`[stub:${adapter}]`);
  expect(verboseJson).toHaveProperty("taskRecords");
  expect(verboseRun.stdout).not.toBe(defaultRun.stdout);
};

const runLiveLocalLlmSmoke = () => {
  const defaultRun = runCliWithEnvAndTimeout(
    [liveLocalLlmSmokePrompt],
    {
      LOCAL_LLM_API_BASE: liveLocalLlmSmokeApiBase,
      LOCAL_LLM_API_KEY: liveLocalLlmSmokeApiKey,
      LOCAL_LLM_MODEL_NAME: liveLocalLlmSmokeModelName,
      TRANSLATION_MAX_ATTEMPTS: "1",
    },
    liveLocalLlmSmokeTimeoutMs,
  );
  const verboseRun = runCliWithEnvAndTimeout(
    [liveLocalLlmSmokePrompt, "--verbose"],
    {
      LOCAL_LLM_API_BASE: liveLocalLlmSmokeApiBase,
      LOCAL_LLM_API_KEY: liveLocalLlmSmokeApiKey,
      LOCAL_LLM_MODEL_NAME: liveLocalLlmSmokeModelName,
      TRANSLATION_MAX_ATTEMPTS: "1",
    },
    liveLocalLlmSmokeTimeoutMs,
  );

  expect(defaultRun.error).toBeUndefined();
  expect(verboseRun.error).toBeUndefined();
  expect(defaultRun.status).toBe(0);
  expect(verboseRun.status).toBe(0);
  expect(defaultRun.stderr).toBe("");
  expect(verboseRun.stderr).toBe("");

  const defaultJson = JSON.parse(defaultRun.stdout.trim());
  const verboseJson = JSON.parse(verboseRun.stdout.trim());

  expect(defaultJson).toMatchObject({
    ok: true,
    mode: "run",
    adapter: "codex",
    promptLanguage: "ko",
    promptValidationErrors: [],
  });
  expect(defaultJson).toHaveProperty("summary");
  expect(defaultJson).toHaveProperty("nextAction");
  expect(defaultJson).toHaveProperty("promptInferenceTimeSec");
  expect(defaultJson).toHaveProperty("promptRepairActions");
  expect(defaultJson).not.toHaveProperty("rawOutput");

  expect(verboseJson).toMatchObject({
    ok: true,
    mode: "run",
    adapter: "codex",
    promptLanguage: "ko",
    promptValidationErrors: [],
  });
  expect(verboseJson).toHaveProperty("summary");
  expect(verboseJson).toHaveProperty("nextAction");
  expect(verboseJson).toHaveProperty("promptInferenceTimeSec");
  expect(verboseJson).toHaveProperty("promptRepairActions");
  expect(verboseJson).toHaveProperty("compiledPrompt");
  expect(verboseJson).toHaveProperty("role2Handoff");
  expect(verboseJson).toHaveProperty("rawOutput");
  expect(verboseJson).toHaveProperty("taskRecords");
  expect(verboseJson.rawOutput).toContain("[stub:codex]");
  expect(verboseRun.stdout).not.toBe(defaultRun.stdout);
};

describe("detoks CLI smoke", () => {
  it("prints the main CLI guide for an empty invocation", () => {
    const emptyRun = runCli([]);

    expect(emptyRun.error).toBeUndefined();
    expect(emptyRun.status).toBe(0);
    expect(emptyRun.stderr).toBe("");
    expect(emptyRun.stdout).toContain("DeToks CLI 가이드");
    expect(emptyRun.stdout).toContain("빠른 시작:");
    expect(emptyRun.stdout).toContain('detoks "현재 저장소 상태를 요약해줘"');
    expect(emptyRun.stdout).toContain("detoks repl");
    expect(emptyRun.stdout).toContain("detoks session list");
  });

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
      promptLanguage: "en",
      promptInferenceTimeSec: 0,
      promptValidationErrors: [],
      promptRepairActions: [],
    });
    expect(defaultJson).not.toHaveProperty("stages");
    expect(defaultJson).not.toHaveProperty("rawOutput");

    expect(verboseJson).toMatchObject({
      ok: true,
      mode: "run",
      adapter: "codex",
      summary: "All 1 task(s) completed",
      nextAction: "Pipeline complete",
      promptLanguage: "en",
      promptInferenceTimeSec: 0,
      promptValidationErrors: [],
      promptRepairActions: [],
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
      error: "알 수 없는 플래그: --unknown. 사용법은 `detoks --help`를 참고하세요.",
    });
    expect(defaultJson).not.toHaveProperty("stack");

    expect(verboseJson).toMatchObject({
      ok: false,
      error: "알 수 없는 플래그: --unknown. 사용법은 `detoks --help`를 참고하세요.",
    });
    expect(verboseJson.stack).toContain("알 수 없는 플래그: --unknown");
    expect(verboseRun.stderr).not.toBe(defaultRun.stderr);
  });

  it("shows start and close messages for repl in default mode", () => {
    rmSync(repoReplRegistryPath, { force: true });
    try {
      const replRun = runCliWithInput(["repl"], "exit\n");

      expect(replRun.error).toBeUndefined();
      expect(replRun.status).toBe(0);
      expect(replRun.stderr).toBe("");
      expect(replRun.stdout).toContain("detoks repl 시작됨");
      expect(replRun.stdout).toContain("executionMode=stub");
      expect(replRun.stdout).toContain("verbose=false");
      expect(replRun.stdout).toContain('"/help" 입력 시 REPL 도움말');
      expect(replRun.stdout).toContain("detoks[codex]> ");
      expect(replRun.stdout.trimEnd()).toMatch(/detoks repl이 종료되었습니다\.$/);
    } finally {
      rmSync(repoReplRegistryPath, { force: true });
    }
  });

  it("shows verbose=true in repl start message for verbose mode", () => {
    rmSync(repoReplRegistryPath, { force: true });
    try {
      const replRun = runCliWithInput(["repl", "--verbose"], "exit\n");

      expect(replRun.error).toBeUndefined();
      expect(replRun.status).toBe(0);
      expect(replRun.stderr).toBe("");
      expect(replRun.stdout).toContain("detoks repl 시작됨");
      expect(replRun.stdout).toContain("executionMode=stub");
      expect(replRun.stdout).toContain("verbose=true");
      expect(replRun.stdout).toContain('"/help" 입력 시 REPL 도움말');
      expect(replRun.stdout).toContain("detoks[codex]> ");
      expect(replRun.stdout.trimEnd()).toMatch(/detoks repl이 종료되었습니다\.$/);
    } finally {
      rmSync(repoReplRegistryPath, { force: true });
    }
  });

  it("supports /exit as a repl builtin exit command", () => {
    rmSync(repoReplRegistryPath, { force: true });
    try {
      const replRun = runCliWithInput(["repl"], "/exit\n");

      expect(replRun.error).toBeUndefined();
      expect(replRun.status).toBe(0);
      expect(replRun.stderr).toBe("");
      expect(replRun.stdout).toContain("detoks repl 시작됨");
      expect(replRun.stdout).toContain("detoks repl이 종료되었습니다.");
    } finally {
      rmSync(repoReplRegistryPath, { force: true });
    }
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
      const emptyOutput = JSON.parse(emptyRun.stdout.trim());
      expect(emptyOutput).toEqual({
        ok: true,
        mode: "checkpoint-list",
        sessionId,
        mutatesState: false,
        hasCheckpoints: false,
        checkpointCount: 0,
        message: `세션 ${sessionId}에 저장된 체크포인트가 없습니다.`,
        checkpoints: [],
      });
      expect(emptyOutput).not.toHaveProperty("promptLanguage");
      expect(emptyOutput).not.toHaveProperty("promptInferenceTimeSec");
      expect(emptyOutput).not.toHaveProperty("promptValidationErrors");
      expect(emptyOutput).not.toHaveProperty("promptRepairActions");

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
      const populatedOutput = JSON.parse(populatedRun.stdout.trim());
      expect(populatedOutput).toEqual({
        ok: true,
        mode: "checkpoint-list",
        sessionId,
        mutatesState: false,
        hasCheckpoints: true,
        checkpointCount: 1,
        message: `세션 ${sessionId}에서 체크포인트 1개를 찾았습니다.`,
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
      expect(populatedOutput).not.toHaveProperty("promptLanguage");
      expect(populatedOutput).not.toHaveProperty("promptInferenceTimeSec");
      expect(populatedOutput).not.toHaveProperty("promptValidationErrors");
      expect(populatedOutput).not.toHaveProperty("promptRepairActions");
    } finally {
      rmSync(checkpointPath, { force: true });
    }
  });

  it("reports when session continue cannot find the target session", () => {
    const missingSessionId = `session_cli_missing_${Date.now()}`;
    const missingRun = runCli(["session", "continue", missingSessionId]);

    expect(missingRun.error).toBeUndefined();
    expect(missingRun.status).toBe(0);
    expect(missingRun.stderr).toBe("");
    expect(JSON.parse(missingRun.stdout.trim())).toEqual({
      ok: true,
      mode: "session-continue",
      sessionId: missingSessionId,
      canContinue: false,
      resumeStarted: false,
      mutatesState: false,
      message: `세션 ${missingSessionId}을(를) 찾을 수 없습니다. 재개를 시작하지 않았습니다.`,
      nextAction: null,
    });
  });

  it("resumes a saved session and skips already completed tasks", () => {
    const sessionId = `session_cli_resume_${Date.now()}`;
    const sessionDir = join(repoRoot, ".state", "sessions");
    const sessionPath = join(sessionDir, `${sessionId}.json`);

    try {
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(
        sessionPath,
        JSON.stringify({
          version: "1",
          shared_context: {
            session_id: sessionId,
            raw_input: "Find the auth module. Test the auth module.",
          },
          task_results: {
            t1: {
              task_id: "t1",
              success: true,
              summary: "previous raw",
              raw_output: "previous raw",
            },
          },
          current_task_id: "t2",
          completed_task_ids: ["t1"],
          next_action: "Resume remaining validation",
          updated_at: "2026-04-27T00:00:00.000Z",
        }),
        "utf8",
      );

      const continueRun = runCli(["session", "continue", sessionId]);

      expect(continueRun.error).toBeUndefined();
      expect(continueRun.status).toBe(0);
      expect(continueRun.stderr).toBe("");

      const output = JSON.parse(continueRun.stdout.trim());
      expect(output).toMatchObject({
        ok: true,
        mode: "session-continue",
        sessionId,
        canContinue: true,
        resumeStarted: true,
        mutatesState: true,
        message: `세션 ${sessionId}이(가) 저장된 raw_input으로 재개되었습니다.`,
        adapter: "codex",
        summary: "All 2 task(s) completed",
        nextAction: "Pipeline complete",
      });
      expect(output.taskRecords).toEqual([
        { taskId: "t1", status: "completed", rawOutput: "previous raw" },
        expect.objectContaining({
          taskId: "t2",
          status: "completed",
        }),
      ]);
      expect(output.rawOutput).toContain("[stub:codex]");

      const resumed = JSON.parse(readFileSync(sessionPath, "utf8"));
      expect(resumed.shared_context.raw_input).toBe(
        "Find the auth module. Test the auth module.",
      );
      expect(resumed.completed_task_ids).toEqual(["t1", "t2"]);
      expect(resumed.task_results.t2.raw_output).toContain("[stub:codex]");
    } finally {
      rmSync(sessionPath, { force: true });
    }
  });

  it("forks a saved session without starting resume execution", () => {
    const sourceSessionId = `session_cli_source_${Date.now()}`;
    const newSessionId = `${sourceSessionId}_fork`;
    const sessionDir = join(repoRoot, ".state", "sessions");
    const sourcePath = join(sessionDir, `${sourceSessionId}.json`);
    const forkPath = join(sessionDir, `${newSessionId}.json`);

    try {
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(
        sourcePath,
        JSON.stringify({
          shared_context: {
            session_id: sourceSessionId,
            retained: true,
          },
          task_results: {
            task_001: {
              task_id: "task_001",
              success: true,
              summary: "Source result",
              raw_output: "source raw",
            },
          },
          current_task_id: "task_002",
          completed_task_ids: ["task_001"],
          next_action: "Review session fork stdout contract",
          updated_at: "2026-04-27T00:00:00.000Z",
        }),
        "utf8",
      );

      const forkRun = runCli(["session", "fork", sourceSessionId, newSessionId]);

      expect(forkRun.error).toBeUndefined();
      expect(forkRun.status).toBe(0);
      expect(forkRun.stderr).toBe("");
      expect(JSON.parse(forkRun.stdout.trim())).toEqual({
        ok: true,
        mode: "session-fork",
        sourceSessionId,
        newSessionId,
        forked: true,
        mutatesState: true,
        message: `세션 ${sourceSessionId}이(가) ${newSessionId}(으)로 포크되었습니다.`,
        nextAction: "Review session fork stdout contract",
      });

      const forked = JSON.parse(readFileSync(forkPath, "utf8"));
      expect(forked.shared_context.session_id).toBe(newSessionId);
      expect(forked.shared_context.retained).toBe(true);
      expect(forked.task_results.task_001.summary).toBe("Source result");
      expect(forked.completed_task_ids).toEqual(["task_001"]);

      const duplicateRun = runCli(["session", "fork", sourceSessionId, newSessionId]);
      expect(duplicateRun.error).toBeUndefined();
      expect(duplicateRun.status).toBe(1);
      expect(duplicateRun.stderr).toBe("");
      expect(JSON.parse(duplicateRun.stdout.trim())).toMatchObject({
        ok: false,
        mode: "session-fork",
        sourceSessionId,
        newSessionId,
        forked: false,
        mutatesState: false,
      });
    } finally {
      rmSync(sourcePath, { force: true });
      rmSync(forkPath, { force: true });
    }
  });

  it("resets a saved session and removes its persisted state file", () => {
    const missingSessionId = `session_cli_missing_reset_${Date.now()}`;
    const sessionId = `session_cli_reset_${Date.now()}`;
    const sessionDir = join(repoRoot, ".state", "sessions");
    const sessionPath = join(sessionDir, `${sessionId}.json`);

    try {
      const missingRun = runCli(["session", "reset", missingSessionId]);

      expect(missingRun.error).toBeUndefined();
      expect(missingRun.status).toBe(1);
      expect(missingRun.stderr).toBe("");
      expect(JSON.parse(missingRun.stdout.trim())).toEqual({
        ok: false,
        mode: "session-reset",
        sessionId: missingSessionId,
        reset: false,
        mutatesState: false,
        message: `세션 ${missingSessionId}을(를) 찾을 수 없습니다.`,
      });

      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(
        sessionPath,
        JSON.stringify({
          shared_context: {
            session_id: sessionId,
          },
          task_results: {},
          current_task_id: null,
          completed_task_ids: [],
          next_action: "Reset this session",
          updated_at: "2026-04-27T00:00:00.000Z",
        }),
        "utf8",
      );

      const resetRun = runCli(["session", "reset", sessionId]);

      expect(resetRun.error).toBeUndefined();
      expect(resetRun.status).toBe(0);
      expect(resetRun.stderr).toBe("");
      expect(JSON.parse(resetRun.stdout.trim())).toEqual({
        ok: true,
        mode: "session-reset",
        sessionId,
        reset: true,
        mutatesState: true,
        message: `세션 ${sessionId}이(가) 초기화(삭제)되었습니다.`,
      });
      expect(() => readFileSync(sessionPath, "utf8")).toThrow();
    } finally {
      rmSync(sessionPath, { force: true });
    }
  });

  it("restores a session to checkpoint state and truncates later task history", () => {
    const sessionId = `session_cli_restore_${Date.now()}`;
    const checkpointId = `${sessionId}_checkpoint_001`;
    const sessionDir = join(repoRoot, ".state", "sessions");
    const checkpointDir = join(repoRoot, ".state", "checkpoints");
    const sessionPath = join(sessionDir, `${sessionId}.json`);
    const checkpointPath = join(checkpointDir, `${checkpointId}.json`);

    try {
      mkdirSync(sessionDir, { recursive: true });
      mkdirSync(checkpointDir, { recursive: true });
      writeFileSync(
        sessionPath,
        JSON.stringify({
          shared_context: {
            session_id: sessionId,
          },
          task_results: {
            task_001: {
              task_id: "task_001",
              success: true,
              summary: "Initial result",
              raw_output: "task one raw",
            },
            task_002: {
              task_id: "task_002",
              success: true,
              summary: "Later result",
              raw_output: "task two raw",
            },
          },
          current_task_id: "task_003",
          completed_task_ids: ["task_001", "task_002"],
          next_action: "Review restored state",
          updated_at: "2026-04-27T00:00:00.000Z",
        }),
        "utf8",
      );
      writeFileSync(
        checkpointPath,
        JSON.stringify({
          id: checkpointId,
          title: "Before later task",
          task_id: "task_001",
          summary: "Checkpoint summary",
          changed_files: ["src/cli/commands/checkpoint-restore.ts"],
          next_action: "Review restored state",
          created_at: "2026-04-27T00:00:00.000Z",
        }),
        "utf8",
      );

      const restoreRun = runCli(["checkpoint", "restore", checkpointId]);

      expect(restoreRun.error).toBeUndefined();
      expect(restoreRun.status).toBe(0);
      expect(restoreRun.stderr).toBe("");
      expect(JSON.parse(restoreRun.stdout.trim())).toEqual({
        ok: true,
        mode: "checkpoint-restore",
        sessionId,
        checkpointId,
        restored: true,
        mutatesState: true,
        message: `세션 ${sessionId}이(가) 체크포인트 ${checkpointId}(으)로 복원되었습니다.`,
      });

      const restored = JSON.parse(readFileSync(sessionPath, "utf8"));
      expect(restored.completed_task_ids).toEqual(["task_001"]);
      expect(restored.current_task_id).toBeNull();
      expect(restored.task_results.task_001.summary).toBe("Initial result");
      expect(restored.task_results.task_002).toBeUndefined();
    } finally {
      rmSync(sessionPath, { force: true });
      rmSync(checkpointPath, { force: true });
    }
  });

  it("prints minimal session list JSON for saved sessions", () => {
    const sessionId = `session_cli_smoke_${Date.now()}`;
    const sessionDir = join(repoRoot, ".state", "sessions");
    const sessionPath = join(sessionDir, `${sessionId}.json`);

    try {
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(
        sessionPath,
        JSON.stringify({
          shared_context: {
            session_id: sessionId,
          },
          task_results: {
            task_001: {
              summary: "Smoke result",
            },
          },
          current_task_id: "task_001",
          completed_task_ids: ["task_001"],
          next_action: "Review session list stdout contract",
          updated_at: "2026-04-27T00:00:00.000Z",
        }),
        "utf8",
      );

      const run = runCli(["session", "list"]);

      expect(run.error).toBeUndefined();
      expect(run.status).toBe(0);
      expect(run.stderr).toBe("");

      const output = JSON.parse(run.stdout.trim());
      expect(output).toMatchObject({
        ok: true,
        mode: "session-list",
        mutatesState: false,
        hasSessions: true,
      });
      expect(output).not.toHaveProperty("promptLanguage");
      expect(output).not.toHaveProperty("promptInferenceTimeSec");
      expect(output).not.toHaveProperty("promptValidationErrors");
      expect(output).not.toHaveProperty("promptRepairActions");
      expect(output.sessionCount).toBeGreaterThanOrEqual(1);
      expect(output.sessions).toEqual(
        expect.arrayContaining([
          {
            id: sessionId,
            updatedAt: "2026-04-27T00:00:00.000Z",
            currentTaskId: "task_001",
            completedTaskCount: 1,
            taskResultCount: 1,
            nextAction: "Review session list stdout contract",
          },
        ]),
      );
    } finally {
      rmSync(sessionPath, { force: true });
    }
  });

  it("stores detected project metadata in saved session state", () => {
    const cwd = mkdtempSync(join(tmpdir(), "detoks-cli-project-meta-"));
    const sessionId = `session_cli_project_${Date.now()}`;

    try {
      writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "project-meta-app" }), "utf8");

      const run = runCliFromCwd(cwd, ["hello detoks", "--session", sessionId]);

      expect(run.error).toBeUndefined();
      expect(run.status).toBe(0);
      expect(run.stderr).toBe("");

      const savedSession = JSON.parse(
        readFileSync(join(cwd, ".state", "sessions", `${sessionId}.json`), "utf8"),
      );
      expect(savedSession.shared_context.project_id).toBe("project-meta-app");
      expect(savedSession.shared_context.project_name).toBe("project-meta-app");
      expect(savedSession.shared_context.project_path).toBe(realpathSync(cwd));
    } finally {
      rmSync(cwd, { force: true, recursive: true });
    }
  });

  it("stores the last repl session per project in the registry file", () => {
    const cwd = mkdtempSync(join(tmpdir(), "detoks-cli-repl-registry-"));

    try {
      writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "repl-registry-app" }), "utf8");

      const firstRun = runCliWithInputFromCwd(cwd, ["repl"], "hello from repl\nexit\n");

      expect(firstRun.error).toBeUndefined();
      expect(firstRun.status).toBe(0);
      expect(firstRun.stderr).toBe("");

      const registryAfterFirstRun = JSON.parse(
        readFileSync(join(cwd, ".repl-session.json"), "utf8"),
      );
      const firstSessionId = registryAfterFirstRun.last_session?.session_id as string | undefined;
      expect(firstSessionId).toBeTruthy();
      expect(registryAfterFirstRun.last_session).toMatchObject({
        project_id: "repl-registry-app",
        session_id: firstSessionId,
        adapter: "codex",
        execution_mode: "stub",
      });

      const secondRun = runCliWithInputFromCwd(cwd, ["repl"], "exit\n");

      expect(secondRun.error).toBeUndefined();
      expect(secondRun.status).toBe(0);
      expect(secondRun.stderr).toBe("");
      const registryAfterSecondRun = JSON.parse(
        readFileSync(join(cwd, ".repl-session.json"), "utf8"),
      );
      expect(registryAfterSecondRun.last_session).toMatchObject({
        project_id: "repl-registry-app",
        adapter: "codex",
        execution_mode: "stub",
      });
      expect(registryAfterSecondRun.last_session.session_id).toMatch(/^repl-[A-Za-z0-9]{16}$/);
    } finally {
      rmSync(cwd, { force: true, recursive: true });
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
      const output = JSON.parse(showRun.stdout.trim());
      expect(output).toEqual({
        ok: true,
        mode: "checkpoint-show",
        mutatesState: false,
        message: `체크포인트 ${checkpointId}을(를) 불러왔습니다.`,
        checkpoint: {
          id: checkpointId,
          title: "Smoke checkpoint",
          taskId: "task_001",
          createdAt: "2026-04-27T00:00:00.000Z",
          changedFiles: ["src/cli/commands/checkpoint-show.ts"],
          nextAction: "Review checkpoint show stdout contract",
        },
      });
      expect(output).not.toHaveProperty("promptLanguage");
      expect(output).not.toHaveProperty("promptInferenceTimeSec");
      expect(output).not.toHaveProperty("promptValidationErrors");
      expect(output).not.toHaveProperty("promptRepairActions");
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
        mutatesState: false,
        message: `체크포인트 ${checkpointId}을(를) 불러왔습니다.`,
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

  for (const adapter of realBinarySmokeTargets) {
    realBinarySmoke(
      `runs the real execution contract against installed ${adapter} when opted in`,
      () => {
        runInstalledRealAdapterSmoke(adapter);
      },
    );
  }

  liveLocalLlmSmoke(
    "runs the live local LLM prompt runtime contract when opted in",
    () => {
      runLiveLocalLlmSmoke();
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

  it("surfaces prompt compilation failures as structured stderr for Korean input without translation config", () => {
    const failedRun = runCliWithEnv(
      ["새 파일을 생성해"],
      {
        LOCAL_LLM_API_BASE: "",
        LOCAL_LLM_API_KEY: "",
        LOCAL_LLM_MODEL_NAME: "",
      },
    );

    expect(failedRun.error).toBeUndefined();
    expect(failedRun.status).toBe(1);
    expect(failedRun.stdout).toBe("");

    const failedJson = JSON.parse(failedRun.stderr.trim());
    expect(failedJson).toEqual({
      ok: false,
      error: "Prompt compilation failed: LLM client requires LOCAL_LLM_API_BASE",
      rawOutput: "LLM client requires LOCAL_LLM_API_BASE",
    });
  });

  it("reads LOCAL_LLM_* connection settings from the current cwd .env file", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "detoks-cli-env-"));

    try {
      writeFileSync(
        join(tempDir, ".env"),
        [
          "LOCAL_LLM_API_BASE=http://127.0.0.1:1234/v1",
          "LOCAL_LLM_API_KEY=test-key",
          "LOCAL_LLM_MODEL_NAME=",
          "LOCAL_LLM_AUTO_START=0",
        ].join("\n"),
        "utf8",
      );

      const failedRun = runCliFromCwd(tempDir, ["새 파일을 생성해"]);

      expect(failedRun.error).toBeUndefined();
      expect(failedRun.status).toBe(1);
      expect(failedRun.stdout).toBe("");

      const failedJson = JSON.parse(failedRun.stderr.trim());
      expect(failedJson).toEqual({
        ok: false,
        error: "Prompt compilation failed: LLM client requires LOCAL_LLM_MODEL_NAME",
        rawOutput: "LLM client requires LOCAL_LLM_MODEL_NAME",
      });
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
