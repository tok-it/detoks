import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const cliEntry = resolve(repoRoot, "src/cli/index.ts");
const tsxLoader = resolve(repoRoot, "node_modules/tsx/dist/loader.mjs");

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
  spawnSync(process.execPath, ["--import", tsxLoader, cliEntry, ...args], {
    cwd,
    encoding: "utf8",
  });

const runCliWithInputFromCwd = (
  cwd: string,
  args: string[],
  input: string,
) =>
  spawnSync(process.execPath, ["--import", tsxLoader, cliEntry, ...args], {
    cwd,
    encoding: "utf8",
    input,
  });

const parseCliJson = (output: string) => {
  const trimmed = output.trim();
  const jsonStart = trimmed.indexOf("{");
  if (jsonStart < 0) {
    throw new Error(`CLI output did not contain JSON: ${trimmed}`);
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = jsonStart; i < trimmed.length; i += 1) {
    const char = trimmed[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(trimmed.slice(jsonStart, i + 1));
      }
    }
  }

  throw new Error(`CLI output did not contain a complete JSON object: ${trimmed}`);
};

const completedPipelineStages = [
  { name: "Prompt Compiler", owner: "role1", status: "completed" },
  { name: "Task Graph Builder", owner: "role2.1", status: "completed" },
  { name: "Context Optimizer", owner: "role2.2", status: "completed" },
  { name: "Executor", owner: "role3", status: "ready" },
  { name: "State Manager", owner: "role2.2", status: "completed" },
] as const;

const failedPipelineStages = [
  { name: "Prompt Compiler", owner: "role1", status: "failed" },
  { name: "Task Graph Builder", owner: "role2.1", status: "failed" },
  { name: "Context Optimizer", owner: "role2.2", status: "failed" },
  { name: "Executor", owner: "role3", status: "ready" },
  { name: "State Manager", owner: "role2.2", status: "failed" },
] as const;

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

    const stubRun = runCli([prompt, "--adapter", adapter, "--execution-mode", "stub", "--verbose"]);
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

    const stubJson = parseCliJson(stubRun.stdout);
    const realJson = parseCliJson(realRun.stdout);

    expect(stubJson).toMatchObject({
      ok: true,
      mode: "run",
      adapter,
    });
    expect(stubJson.stages).toEqual(completedPipelineStages);
    expect(stubJson.rawOutput).toContain(`[stub:${adapter}] [EXECUTE] ${prompt}`);
    expect(realJson).toMatchObject({
      ok: true,
      mode: "run",
      adapter,
    });
    expect(realJson.stages).toEqual(completedPipelineStages);
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

  const defaultJson = parseCliJson(defaultRun.stdout);
  const verboseJson = parseCliJson(verboseRun.stdout);

  expect(defaultJson).toMatchObject({
    ok: true,
    mode: "run",
    adapter,
  });
  expect(defaultJson.stages).toEqual(completedPipelineStages);
  expect(defaultJson).toHaveProperty("summary");
  expect(defaultJson).toHaveProperty("nextAction");
  expect(defaultJson).not.toHaveProperty("rawOutput");

  expect(verboseJson).toMatchObject({
    ok: true,
    mode: "run",
    adapter,
  });
  expect(verboseJson.stages).toEqual(completedPipelineStages);
  expect(verboseJson).toHaveProperty("rawOutput");
  expect(verboseJson.rawOutput).not.toContain(`[fake:${adapter}]`);
  expect(verboseJson.rawOutput).not.toContain(`[stub:${adapter}]`);
  expect(verboseJson).toHaveProperty("taskRecords");
  expect(verboseRun.stdout).not.toBe(defaultRun.stdout);
};

const runLiveLocalLlmSmoke = () => {
  const defaultRun = runCliWithEnvAndTimeout(
    [liveLocalLlmSmokePrompt, "--execution-mode", "stub"],
    {
      LOCAL_LLM_API_BASE: liveLocalLlmSmokeApiBase,
      LOCAL_LLM_API_KEY: liveLocalLlmSmokeApiKey,
      LOCAL_LLM_MODEL_NAME: liveLocalLlmSmokeModelName,
      TRANSLATION_MAX_ATTEMPTS: "1",
    },
    liveLocalLlmSmokeTimeoutMs,
  );
  const verboseRun = runCliWithEnvAndTimeout(
    [liveLocalLlmSmokePrompt, "--execution-mode", "stub", "--verbose"],
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

  const defaultJson = parseCliJson(defaultRun.stdout);
  const verboseJson = parseCliJson(verboseRun.stdout);

  expect(defaultJson).toMatchObject({
    ok: true,
    mode: "run",
    adapter: "codex",
    promptLanguage: "ko",
    promptValidationErrors: [],
  });
  expect(defaultJson.stages).toEqual(completedPipelineStages);
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
  expect(verboseJson.stages).toEqual(completedPipelineStages);
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
  it("keeps default stdout concise and verbose stdout full", () => {
    const defaultRun = runCli(["hello detoks", "--execution-mode", "stub"]);
    const verboseRun = runCli(["hello detoks", "--execution-mode", "stub", "--verbose"]);

    expect(defaultRun.error).toBeUndefined();
    expect(verboseRun.error).toBeUndefined();
    expect(defaultRun.status).toBe(0);
    expect(verboseRun.status).toBe(0);
    expect(defaultRun.stderr).toBe("");
    expect(verboseRun.stderr).toBe("");

    const defaultJson = parseCliJson(defaultRun.stdout);
    const verboseJson = parseCliJson(verboseRun.stdout);

    expect(defaultJson).toMatchObject({
      ok: true,
      mode: "run",
      adapter: "codex",
      summary: "1개 작업을 모두 완료했습니다",
      nextAction: "파이프라인이 완료되었습니다.",
      stages: completedPipelineStages,
      promptLanguage: "en",
      promptInferenceTimeSec: 0,
      promptValidationErrors: [],
      promptRepairActions: [],
    });
    expect(defaultJson).toHaveProperty("tokenMetrics");
    expect(defaultJson).not.toHaveProperty("rawOutput");

    expect(verboseJson).toMatchObject({
      ok: true,
      mode: "run",
      adapter: "codex",
      summary: "1개 작업을 모두 완료했습니다",
      nextAction: "파이프라인이 완료되었습니다.",
      promptLanguage: "en",
      promptInferenceTimeSec: 0,
      promptValidationErrors: [],
      promptRepairActions: [],
      rawOutput:
        "[stub:codex] [EXECUTE] hello detoks\n\nContext: Project: detoks\n\nNo previous task context available.",
    });
    expect(verboseJson.stages).toHaveLength(5);
    expect(verboseJson).toHaveProperty("rawOutput");
    expect(verboseRun.stdout).not.toBe(defaultRun.stdout);
  });

  it("enters repl when detoks runs without arguments", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "detoks-cli-default-repl-"));

    try {
      const replRun = runCliWithInputFromCwd(tempDir, [], "exit\n");

      expect(replRun.error).toBeUndefined();
      expect(replRun.status).toBe(0);
      expect(replRun.stderr).toBe("");
      expect(replRun.stdout).toContain("detoks repl 시작");
      expect(replRun.stdout).toContain("executionMode=real");
      expect(replRun.stdout).toContain("verbose=false");
      expect(replRun.stdout).toContain('명령어 목록을 보려면 "/help"를 입력하세요.');
      expect(replRun.stdout).toContain("detoks> ");
      expect(replRun.stdout.trimEnd()).toMatch(/detoks repl 종료\.$/);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("enters repl without surfacing saved session dashboard content", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "detoks-cli-default-repl-session-"));
    const sessionId = `session_home_${Date.now()}`;
    const sessionDir = join(tempDir, ".state", "sessions");
    const sessionPath = join(sessionDir, `${sessionId}.json`);

    try {
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(
        sessionPath,
        JSON.stringify({
          shared_context: {
            session_id: sessionId,
            raw_input: "Refine the CLI home dashboard.",
          },
          task_results: {
            task_001: {
              task_id: "task_001",
              success: true,
              summary: "세션 목록 UX를 검토했습니다.",
              raw_output: "세션 목록 UX를 검토했습니다.",
            },
            task_002: {
              task_id: "task_002",
              success: true,
              summary: "홈 대시보드 진입점을 추가했습니다.",
              raw_output: "홈 대시보드 진입점을 추가했습니다.",
            },
          },
          current_task_id: null,
          completed_task_ids: ["task_001", "task_002"],
          last_summary: "홈 대시보드 진입점을 추가했습니다.",
          next_action: "사람용 세션 목록을 이어서 개선하세요.",
          updated_at: "2026-04-27T00:00:00.000Z",
        }),
        "utf8",
      );

      const replRun = runCliWithInputFromCwd(tempDir, [], "exit\n");

      expect(replRun.error).toBeUndefined();
      expect(replRun.status).toBe(0);
      expect(replRun.stderr).toBe("");
      expect(replRun.stdout).toContain("detoks repl 시작");
      expect(replRun.stdout).toContain("executionMode=real");
      expect(replRun.stdout).toContain("verbose=false");
      expect(replRun.stdout).toContain('명령어 목록을 보려면 "/help"를 입력하세요.');
      expect(replRun.stdout).toContain("detoks> ");
      expect(replRun.stdout).not.toContain("최근 세션:");
      expect(replRun.stdout).not.toContain(sessionId);
      expect(replRun.stdout.trimEnd()).toMatch(/detoks repl 종료\.$/);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
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

    const defaultJson = parseCliJson(defaultRun.stderr);
    const verboseJson = parseCliJson(verboseRun.stderr);

    expect(defaultJson).toEqual({
      ok: false,
      error: "알 수 없는 플래그: --unknown. 사용법은 `detoks --help`를 확인하세요.",
    });
    expect(defaultJson).not.toHaveProperty("stack");

    expect(verboseJson).toMatchObject({
      ok: false,
      error: "알 수 없는 플래그: --unknown. 사용법은 `detoks --help`를 확인하세요.",
    });
    expect(verboseJson.stack).toContain("알 수 없는 플래그: --unknown");
    expect(verboseRun.stderr).not.toBe(defaultRun.stderr);
  });

  it("shows start and close messages for repl in default mode", () => {
    const replRun = runCliWithInput(["repl"], "exit\n");

    expect(replRun.error).toBeUndefined();
    expect(replRun.status).toBe(0);
    expect(replRun.stderr).toBe("");
    expect(replRun.stdout).toContain("detoks repl 시작");
    expect(replRun.stdout).toContain("executionMode=real");
    expect(replRun.stdout).toContain("verbose=false");
    expect(replRun.stdout).toContain('명령어 목록을 보려면 "/help"를 입력하세요.');
    expect(replRun.stdout).toContain("detoks> ");
    expect(replRun.stdout.trimEnd()).toMatch(/detoks repl 종료\.$/);
  });

  it("shows verbose=true in repl start message for verbose mode", () => {
    const replRun = runCliWithInput(["repl", "--verbose"], "exit\n");

    expect(replRun.error).toBeUndefined();
    expect(replRun.status).toBe(0);
    expect(replRun.stderr).toBe("");
    expect(replRun.stdout).toContain("detoks repl 시작");
    expect(replRun.stdout).toContain("executionMode=real");
    expect(replRun.stdout).toContain("verbose=true");
    expect(replRun.stdout).toContain('명령어 목록을 보려면 "/help"를 입력하세요.');
    expect(replRun.stdout).toContain("detoks> ");
    expect(replRun.stdout.trimEnd()).toMatch(/detoks repl 종료\.$/);
  });

  it("streams pipeline progress lines in repl before the final result", () => {
    const replRun = runCliWithInput(["repl", "--execution-mode", "stub"], "hello detoks\nexit\n");

    expect(replRun.error).toBeUndefined();
    expect(replRun.status).toBe(0);
    expect(replRun.stderr).toBe("");
    expect(replRun.stdout).toContain("Prompt Compiler 시작");
    expect(replRun.stdout).toContain("Task Graph Builder 시작");
    expect(replRun.stdout).toContain("Context Optimizer(t1) 시작");
    expect(replRun.stdout).toContain("Executor(t1) 실행 중");
    expect(replRun.stdout).toContain("State Manager: 최종 세션 저장 완료");
    expect(replRun.stdout.indexOf("Prompt Compiler 시작")).toBeLessThan(
      replRun.stdout.indexOf("{"),
    );

    const output = parseCliJson(replRun.stdout);
    expect(output).toMatchObject({
      ok: true,
      mode: "repl",
      adapter: "codex",
      summary: "1개 작업을 모두 완료했습니다",
      nextAction: "파이프라인이 완료되었습니다.",
      promptLanguage: "en",
      promptInferenceTimeSec: 0,
      promptValidationErrors: [],
      promptRepairActions: [],
      stages: completedPipelineStages,
    });
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

      const defaultJson = parseCliJson(defaultRun.stdout);
      const verboseJson = parseCliJson(verboseRun.stdout);

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
      const emptyOutput = parseCliJson(emptyRun.stdout);
      expect(emptyOutput).toEqual({
        ok: true,
        mode: "checkpoint-list",
        sessionId,
        mutatesState: false,
        hasCheckpoints: false,
        checkpointCount: 0,
        message: `세션 ${sessionId}에서 체크포인트를 찾지 못했습니다.`,
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
          title: "스모크 체크포인트",
          task_id: "task_001",
          summary: "스모크 요약",
          changed_files: ["src/cli/commands/checkpoint-list.ts"],
          next_action: "stdout 계약을 검토하세요",
          created_at: "2026-04-27T00:00:00.000Z",
        }),
        "utf8",
      );

      const populatedRun = runCli(["checkpoint", "list", sessionId]);

      expect(populatedRun.error).toBeUndefined();
      expect(populatedRun.status).toBe(0);
      expect(populatedRun.stderr).toBe("");
      const populatedOutput = parseCliJson(populatedRun.stdout);
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
            title: "스모크 체크포인트",
            taskId: "task_001",
            createdAt: "2026-04-27T00:00:00.000Z",
            changedFiles: ["src/cli/commands/checkpoint-list.ts"],
            nextAction: "stdout 계약을 검토하세요",
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
    const missingRun = runCli(["session", "continue", missingSessionId, "--execution-mode", "stub"]);

    expect(missingRun.error).toBeUndefined();
    expect(missingRun.status).toBe(0);
    expect(missingRun.stderr).toBe("");
    expect(parseCliJson(missingRun.stdout)).toEqual({
      ok: true,
      mode: "session-continue",
      sessionId: missingSessionId,
      canContinue: false,
      resumeStarted: false,
      mutatesState: false,
      resumeOverview: null,
      message: `세션 ${missingSessionId}를 찾지 못했습니다. 다시 시작하지 않았습니다.`,
      nextAction: null,
    });
  });

  it("shows a saved session with JSON and human-readable outputs", () => {
    const sessionId = `session_cli_show_${Date.now()}`;
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
            t1: {
              task_id: "t1",
              success: true,
              summary: "첫 번째 작업 완료",
              raw_output: "[stub:codex] first output",
            },
            t2: {
              task_id: "t2",
              success: false,
              summary: "두 번째 작업 실패",
              raw_output: "[stub:codex] second output",
            },
          },
          current_task_id: "t2",
          completed_task_ids: ["t1"],
          next_action: "다음 작업을 확인하세요",
          updated_at: "2026-04-27T00:00:00.000Z",
        }),
        "utf8",
      );

      const jsonRun = runCli(["session", "show", sessionId]);
      expect(jsonRun.error).toBeUndefined();
      expect(jsonRun.status).toBe(0);
      expect(jsonRun.stderr).toBe("");
      expect(parseCliJson(jsonRun.stdout)).toEqual({
        ok: true,
        mode: "session-show",
        sessionId,
        hasSession: true,
        mutatesState: false,
        message: `세션 ${sessionId}의 저장된 작업 결과를 불러왔습니다.`,
        overview: {
          summary: "첫 번째 작업 완료",
          nextAction: "다음 작업을 확인하세요",
          currentTaskId: "t2",
          completedTaskCount: 1,
          taskResultCount: 2,
          updatedAt: "2026-04-27T00:00:00.000Z",
        },
        taskResults: [
          {
            taskId: "t1",
            success: true,
            summary: "첫 번째 작업 완료",
            rawOutputPreview: "[stub:codex] first output",
          },
          {
            taskId: "t2",
            success: false,
            summary: "두 번째 작업 실패",
            rawOutputPreview: "[stub:codex] second output",
          },
        ],
      });

      const humanRun = runCli(["session", "show", sessionId, "--human"]);
      expect(humanRun.error).toBeUndefined();
      expect(humanRun.status).toBe(0);
      expect(humanRun.stderr).toBe("");
      expect(humanRun.stdout).toContain(`detoks 세션 ${sessionId}`);
      expect(humanRun.stdout).toContain("최근 요약: 첫 번째 작업 완료");
      expect(humanRun.stdout).toContain("저장된 작업 결과:");
      expect(humanRun.stdout).toContain("첫 번째 작업 완료");
      expect(humanRun.stdout).toContain("[stub:codex] second output");
    } finally {
      rmSync(sessionPath, { force: true });
    }
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
          next_action: "남은 검증을 다시 시작하세요",
          updated_at: "2026-04-27T00:00:00.000Z",
        }),
        "utf8",
      );

      const continueRun = runCli(["session", "continue", sessionId, "--execution-mode", "stub"]);

      expect(continueRun.error).toBeUndefined();
      expect(continueRun.status).toBe(0);
      expect(continueRun.stderr).toContain(`세션 ${sessionId} 재진입 요약`);
      expect(continueRun.stderr).toContain("최근 요약: previous raw");

      const output = parseCliJson(continueRun.stdout);
      expect(output).toMatchObject({
        ok: true,
        mode: "session-continue",
        sessionId,
        canContinue: true,
        resumeStarted: true,
        mutatesState: true,
        resumeOverview: {
          summary: "previous raw",
          nextAction: "남은 검증을 다시 시작하세요",
          currentTaskId: "t2",
          completedTaskCount: 1,
          taskResultCount: 1,
          updatedAt: "2026-04-27T00:00:00.000Z",
        },
        message: `세션 ${sessionId}를 저장된 raw_input으로 다시 시작했습니다.`,
        adapter: "codex",
        summary: "2개 작업을 모두 완료했습니다",
        nextAction: "파이프라인이 완료되었습니다.",
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
          next_action: "세션 포크 stdout 계약을 검토하세요",
          updated_at: "2026-04-27T00:00:00.000Z",
        }),
        "utf8",
      );

      const forkRun = runCli(["session", "fork", sourceSessionId, newSessionId]);

      expect(forkRun.error).toBeUndefined();
      expect(forkRun.status).toBe(0);
      expect(forkRun.stderr).toBe("");
      expect(parseCliJson(forkRun.stdout)).toEqual({
        ok: true,
        mode: "session-fork",
        sourceSessionId,
        newSessionId,
        forked: true,
        mutatesState: true,
        message: `세션 ${sourceSessionId}를 ${newSessionId}로 포크했습니다.`,
        nextAction: "세션 포크 stdout 계약을 검토하세요",
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
      expect(parseCliJson(duplicateRun.stdout)).toMatchObject({
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
      expect(parseCliJson(missingRun.stdout)).toEqual({
        ok: false,
        mode: "session-reset",
        sessionId: missingSessionId,
        reset: false,
        mutatesState: false,
        message: `세션 ${missingSessionId}를 찾지 못했습니다.`,
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
      expect(parseCliJson(resetRun.stdout)).toEqual({
        ok: true,
        mode: "session-reset",
        sessionId,
        reset: true,
        mutatesState: true,
        message: `세션 ${sessionId}를 초기화(삭제)했습니다.`,
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
          next_action: "복원된 상태를 검토하세요",
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
          next_action: "복원된 상태를 검토하세요",
          created_at: "2026-04-27T00:00:00.000Z",
        }),
        "utf8",
      );

      const restoreRun = runCli(["checkpoint", "restore", checkpointId]);

      expect(restoreRun.error).toBeUndefined();
      expect(restoreRun.status).toBe(0);
      expect(restoreRun.stderr).toBe("");
      expect(parseCliJson(restoreRun.stdout)).toEqual({
        ok: true,
        mode: "checkpoint-restore",
        sessionId,
        checkpointId,
        restored: true,
        mutatesState: true,
        message: `세션 ${sessionId}를 체크포인트 ${checkpointId} 시점으로 복원했습니다.`,
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
              summary: "스모크 결과",
            },
          },
          current_task_id: "task_001",
          completed_task_ids: ["task_001"],
          next_action: "세션 목록 stdout 계약을 검토하세요",
          updated_at: "2026-04-27T00:00:00.000Z",
        }),
        "utf8",
      );

      const run = runCli(["session", "list"]);

      expect(run.error).toBeUndefined();
      expect(run.status).toBe(0);
      expect(run.stderr).toBe("");

      const output = parseCliJson(run.stdout);
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
            nextAction: "세션 목록 stdout 계약을 검토하세요",
          },
        ]),
      );
    } finally {
      rmSync(sessionPath, { force: true });
    }
  });

  it("prints a human-readable session list with the last work summary", () => {
    const sessionId = `session_cli_human_${Date.now()}`;
    const tempDir = mkdtempSync(join(tmpdir(), "detoks-cli-session-list-"));
    const sessionDir = join(tempDir, ".state", "sessions");
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
              summary: "세션 목록 UX를 검토했습니다.",
            },
            task_002: {
              summary: "사람용 세션 목록 모드를 추가했습니다.",
            },
          },
          current_task_id: "task_003",
          completed_task_ids: ["task_001", "task_002"],
          last_summary: "사람용 세션 목록 모드를 추가했습니다.",
          next_action: "CLI 출력을 계속 다듬으세요.",
          updated_at: "2026-04-27T00:00:00.000Z",
        }),
        "utf8",
      );

      const run = runCliFromCwd(tempDir, ["session", "list", "--human"]);

      expect(run.error).toBeUndefined();
      expect(run.status).toBe(0);
      expect(run.stderr).toBe("");
      expect(run.stdout).toContain("detoks 세션 목록");
      expect(run.stdout).toContain("저장된 세션:");
      expect(run.stdout).toContain(sessionId);
      expect(run.stdout).toContain("최근 작업 요약: 사람용 세션 목록 모드를 추가했습니다.");
      expect(run.stdout).toContain("다음 작업: CLI 출력을 계속 다듬으세요.");
      expect(run.stdout).toContain("팁: 각 세션의 최신 작업 요약을 보려면 --human을 추가하세요.");
    } finally {
      rmSync(sessionPath, { force: true });
      rmSync(tempDir, { recursive: true, force: true });
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
          title: "스모크 체크포인트",
          task_id: "task_001",
          summary: "스모크 요약",
          changed_files: ["src/cli/commands/checkpoint-show.ts"],
          next_action: "체크포인트 show stdout 계약을 검토하세요",
          created_at: "2026-04-27T00:00:00.000Z",
        }),
        "utf8",
      );

      const showRun = runCli(["checkpoint", "show", checkpointId]);

      expect(showRun.error).toBeUndefined();
      expect(showRun.status).toBe(0);
      expect(showRun.stderr).toBe("");
      const output = parseCliJson(showRun.stdout);
      expect(output).toEqual({
        ok: true,
        mode: "checkpoint-show",
        mutatesState: false,
        message: `체크포인트 ${checkpointId}를 불러왔습니다.`,
        checkpoint: {
          id: checkpointId,
          title: "스모크 체크포인트",
          taskId: "task_001",
          createdAt: "2026-04-27T00:00:00.000Z",
          changedFiles: ["src/cli/commands/checkpoint-show.ts"],
          nextAction: "체크포인트 show stdout 계약을 검토하세요",
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
          title: "스모크 체크포인트",
          task_id: "task_001",
          summary: "스모크 요약",
          changed_files: ["src/cli/commands/checkpoint-show.ts"],
          next_action: "체크포인트 show stdout 계약을 검토하세요",
          created_at: "2026-04-27T00:00:00.000Z",
        }),
        "utf8",
      );

      const showRun = runCli(["checkpoint", "show", checkpointId]);

      expect(showRun.error).toBeUndefined();
      expect(showRun.status).toBe(0);
      expect(showRun.stderr).toBe("");
      expect(parseCliJson(showRun.stdout)).toEqual({
        ok: true,
        mode: "checkpoint-show",
        mutatesState: false,
        message: `체크포인트 ${checkpointId}를 불러왔습니다.`,
        checkpoint: {
          id: checkpointId,
          title: "스모크 체크포인트",
          taskId: "task_001",
          createdAt: "2026-04-27T00:00:00.000Z",
          changedFiles: ["src/cli/commands/checkpoint-show.ts"],
          nextAction: "체크포인트 show stdout 계약을 검토하세요",
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

      const failedJson = parseCliJson(failedRun.stderr);
      expect(failedJson).toMatchObject({
        ok: false,
        error: "0/1개 작업을 완료했습니다 — 1개 실패",
      });
      expect(failedJson.stages).toEqual(failedPipelineStages);
      expect(failedJson).toHaveProperty("rawOutput");
      expect(failedJson.rawOutput).toContain("[fake:codex] [VALIDATE] fail");

      expect(failedVerboseRun.error).toBeUndefined();
      expect(failedVerboseRun.status).toBe(1);
      expect(failedVerboseRun.stdout).toBe("");
      
      const failedVerboseJson = parseCliJson(failedVerboseRun.stderr);
      expect(failedVerboseJson).toMatchObject({
        ok: false,
        summary: "0/1개 작업을 완료했습니다 — 1개 실패",
      });
      expect(failedVerboseJson.stages).toEqual(failedPipelineStages);
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

    const failedJson = parseCliJson(failedRun.stderr);
    expect(failedJson).toEqual({
      ok: false,
      error: "프롬프트 컴파일 실패: LLM client requires LOCAL_LLM_API_BASE",
      stages: failedPipelineStages,
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
        ].join("\n"),
        "utf8",
      );

      const failedRun = runCliFromCwd(tempDir, ["새 파일을 생성해"]);

      expect(failedRun.error).toBeUndefined();
      expect(failedRun.status).toBe(1);
      expect(failedRun.stdout).toBe("");

      const failedJson = parseCliJson(failedRun.stderr);
      expect(failedJson).toEqual({
        ok: false,
        error: "프롬프트 컴파일 실패: LLM client requires LOCAL_LLM_MODEL_NAME",
        stages: failedPipelineStages,
        rawOutput: "LLM client requires LOCAL_LLM_MODEL_NAME",
      });
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
