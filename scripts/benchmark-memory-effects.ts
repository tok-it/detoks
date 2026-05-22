#!/usr/bin/env tsx

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { orchestratePipeline } from "../src/core/pipeline/orchestrator.js";
import type { Adapter, PipelineExecutionResult } from "../src/core/pipeline/types.js";
import { getRagModelPath } from "../src/core/rag/rag-config.js";
import { SessionStateManager } from "../src/core/state/SessionStateManager.js";
import type { SessionState } from "../src/schemas/pipeline.js";

const DEFAULT_ADAPTER: Adapter = "codex";
const FIXTURE_PROJECT_ID = "memory-effects-fixture";

export interface MemoryEffectsArgs {
  adapter: Adapter;
  output?: string;
  keepTemp: boolean;
}

export interface RunMetrics {
  label: string;
  ok: boolean;
  durationMs: number;
  sessionId: string;
  taskRecords: Array<{ taskId: string; status: string }>;
  adapterStarts: number;
  executorSkips: number;
  cacheHits: number;
  cacheAdvises: number;
  cacheHitKind: "session" | "task" | null;
  tokensSavedByCache: number;
  tokensAddedByRagContext: number;
  netTokensSaved: number;
  cacheHitRate: number;
  ragFound: number;
  ragInjected: number;
  ragSkipped: number;
  ragSkipReason: string | null;
  ragIndexingStatus: string | null;
  sessionTasksCompleted: number | null;
  sessionCurrentTaskId: string | null;
  rawOutputPreview: string;
}

export interface AssertionResult {
  name: string;
  pass: boolean;
  actual: unknown;
  expected: string;
}

export interface ScenarioResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  reason?: string;
  assertions: AssertionResult[];
  runs: RunMetrics[];
  observations?: Record<string, unknown>;
}

export interface MemoryEffectsReport {
  version: 1;
  generatedAt: string;
  adapter: Adapter;
  executionMode: "real";
  detoksHome: string;
  workspace: string;
  ragModelPath: string | null;
  ragModelPresent: boolean;
  scenarios: ScenarioResult[];
  summary: {
    passed: number;
    failed: number;
    skipped: number;
  };
}

function usage(): string {
  return [
    "Usage: npm run benchmark:memory-effects -- [--adapter codex|gemini|claude] [--output file.json] [--keep-temp]",
    "",
    "Runs local real-mode memory-effect scenarios in an isolated DETOKS_HOME and temp fixture workspace.",
  ].join("\n");
}

export function parseArgs(argv: string[] = process.argv.slice(2)): MemoryEffectsArgs {
  const args: MemoryEffectsArgs = { adapter: DEFAULT_ADAPTER, keepTemp: false };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    const next = argv[i + 1];
    if (!current) continue;

    if (current === "--help" || current === "-h") {
      console.log(usage());
      process.exit(0);
    }

    if (current === "--adapter" && next) {
      if (!isAdapter(next)) throw new Error("--adapter must be one of: codex, gemini, claude");
      args.adapter = next;
      i += 1;
      continue;
    }

    if (current === "--output" && next) {
      args.output = next;
      i += 1;
      continue;
    }

    if (current === "--keep-temp") {
      args.keepTemp = true;
      continue;
    }

    throw new Error(`Unknown argument: ${current}\n${usage()}`);
  }

  return args;
}

function isAdapter(value: string): value is Adapter {
  return value === "codex" || value === "gemini" || value === "claude";
}

export function countAdapterStarts(result: PipelineExecutionResult): number {
  return (result.progressLog ?? []).filter(
    (event) => event.stage === "Executor" && event.status === "start",
  ).length;
}

export function countExecutorSkips(result: PipelineExecutionResult): number {
  return (result.progressLog ?? []).filter(
    (event) => event.stage === "Executor" && event.status === "skip",
  ).length;
}

export function countTimelineKind(result: PipelineExecutionResult, kind: string): number {
  return (result.actionTimeline ?? []).filter((event) => event.kind === kind).length;
}

export function collectRunMetrics(
  label: string,
  result: PipelineExecutionResult,
  durationMs: number,
  session: SessionState | null,
): RunMetrics {
  return {
    label,
    ok: result.ok,
    durationMs,
    sessionId: result.sessionId,
    taskRecords: result.taskRecords.map((record) => ({
      taskId: record.taskId,
      status: record.status,
    })),
    adapterStarts: countAdapterStarts(result),
    executorSkips: countExecutorSkips(result),
    cacheHits: countTimelineKind(result, "cache_hit"),
    cacheAdvises: countTimelineKind(result, "cache_advise"),
    cacheHitKind: result.cacheHit?.kind ?? null,
    tokensSavedByCache:
      result.tokenAccounting?.tokensSavedByCache ?? result.cacheHit?.tokensSaved ?? 0,
    tokensAddedByRagContext: result.tokenAccounting?.tokensAddedByRagContext ?? 0,
    netTokensSaved: result.tokenAccounting?.netTokensSaved ?? result.cacheHit?.tokensSaved ?? 0,
    cacheHitRate: result.lightQuality?.cacheHitRate ?? (result.cacheHit ? 1 : 0),
    ragFound: result.ragContextSummary?.found ?? 0,
    ragInjected: result.ragContextSummary?.injected ?? 0,
    ragSkipped: result.ragContextSummary?.skipped ?? 0,
    ragSkipReason: result.ragContextSummary?.skipReason ?? null,
    ragIndexingStatus: result.ragIndexingSummary?.status ?? null,
    sessionTasksCompleted: session?.completed_task_ids.length ?? null,
    sessionCurrentTaskId: session?.current_task_id ?? null,
    rawOutputPreview: result.rawOutput.replace(/\s+/g, " ").trim().slice(0, 240),
  };
}

export function evaluateAssertions(assertions: AssertionResult[]): "passed" | "failed" {
  return assertions.every((assertion) => assertion.pass) ? "passed" : "failed";
}

function assertMetric(name: string, actual: unknown, expected: string, pass: boolean): AssertionResult {
  return { name, actual, expected, pass };
}

function buildTempEnv(detoksHome: string, ragModelPath: string | null): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DETOKS_HOME: detoksHome,
    DETOKS_MEMORY: "on",
    DETOKS_CACHE_DISABLED: "0",
    ...(ragModelPath ? { RAG_EMBEDDING_MODEL_PATH: ragModelPath } : {}),
  };
}

async function withEnv<T>(env: NodeJS.ProcessEnv, fn: () => Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function createFixtureWorkspace(): Promise<string> {
  const workspace = mkdtempSync(join(tmpdir(), "detoks-memory-effects-workspace-"));
  await writeFile(
    join(workspace, "package.json"),
    JSON.stringify({
      name: "detoks-memory-effects-fixture",
      private: true,
      type: "module",
      scripts: { test: "node auth.test.mjs" },
    }, null, 2),
    "utf-8",
  );
  await writeFile(
    join(workspace, "auth.js"),
    [
      "export function validateToken(token) {",
      "  if (typeof token !== 'string' || token.length < 8) return false;",
      "  return token.startsWith('tok_');",
      "}",
      "",
      "export function summarizeAuthRisk() {",
      "  return 'Token validation is length- and prefix-based; refresh-token replay checks are not implemented.';",
      "}",
    ].join("\n"),
    "utf-8",
  );
  await writeFile(
    join(workspace, "auth.test.mjs"),
    [
      "import assert from 'node:assert/strict';",
      "import { validateToken } from './auth.js';",
      "assert.equal(validateToken('tok_12345678'), true);",
      "assert.equal(validateToken('bad'), false);",
    ].join("\n"),
    "utf-8",
  );
  await writeFile(
    join(workspace, "README.md"),
    [
      "# Memory Effects Fixture",
      "",
      "This workspace contains a small auth module for DeToks memory-effect benchmarks.",
      "The intended task is analysis only; benchmark prompts should not edit files.",
    ].join("\n"),
    "utf-8",
  );
  return workspace;
}

async function runPipelineAndCollect(params: {
  label: string;
  adapter: Adapter;
  prompt: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  noCache?: boolean;
  sessionId?: string;
  envOverride?: NodeJS.ProcessEnv;
}): Promise<{ result: PipelineExecutionResult; metrics: RunMetrics; session: SessionState | null }> {
  const env = { ...params.env, ...(params.envOverride ?? {}) };
  const startedAt = Date.now();
  const result = await withEnv(env, () => orchestratePipeline({
    mode: "run",
    adapter: params.adapter,
    executionMode: "real",
    verbose: false,
    trace: false,
    ...(params.noCache ? { noCache: true } : {}),
    projectInfo: {
      projectId: FIXTURE_PROJECT_ID,
      projectPath: params.cwd,
      projectName: "memory-effects-fixture",
    },
    userRequest: {
      raw_input: params.prompt,
      cwd: params.cwd,
      ...(params.sessionId ? { session_id: params.sessionId } : {}),
    },
    env,
  }));
  const durationMs = Date.now() - startedAt;
  const session = await withEnv(env, () => loadSessionIfPresent(result.sessionId, params.cwd));
  return { result, session, metrics: collectRunMetrics(params.label, result, durationMs, session) };
}

async function loadSessionIfPresent(sessionId: string, cwd: string): Promise<SessionState | null> {
  try {
    return await SessionStateManager.loadSession(sessionId, cwd);
  } catch {
    return null;
  }
}

function ensureOk(run: { result: PipelineExecutionResult; metrics: RunMetrics }, scenarioName: string): AssertionResult | null {
  if (run.result.ok) return null;
  return assertMetric(
    `${scenarioName}: pipeline ok`,
    run.metrics.rawOutputPreview || run.result.summary,
    "ok=true",
    false,
  );
}

async function runF1Scenario(adapter: Adapter, cwd: string, env: NodeJS.ProcessEnv): Promise<ScenarioResult> {
  const prompt = "Without editing files, analyze the sample auth module and report the validation behavior.";
  const first = await runPipelineAndCollect({ label: "f1.seed", adapter, prompt, cwd, env });
  const second = await runPipelineAndCollect({ label: "f1.repeat", adapter, prompt, cwd, env });

  const assertions = [
    ensureOk(first, "F1 seed"),
    ensureOk(second, "F1 repeat"),
    assertMetric("repeat uses session cache", second.metrics.cacheHitKind, "session", second.metrics.cacheHitKind === "session"),
    assertMetric("repeat skips adapter execution", second.metrics.adapterStarts, "0", second.metrics.adapterStarts === 0),
    assertMetric("repeat reports token savings", second.metrics.tokensSavedByCache, "> 0", second.metrics.tokensSavedByCache > 0),
  ].filter((value): value is AssertionResult => value !== null);

  return {
    name: "F1 exact session cache",
    status: evaluateAssertions(assertions),
    assertions,
    runs: [first.metrics, second.metrics],
    observations: {
      durationImproved: second.metrics.durationMs < first.metrics.durationMs,
      seedDurationMs: first.metrics.durationMs,
      repeatDurationMs: second.metrics.durationMs,
    },
  };
}

async function runF2Scenario(adapter: Adapter, cwd: string, env: NodeJS.ProcessEnv): Promise<{
  scenario: ScenarioResult;
  seedSession: SessionState | null;
}> {
  const seedPrompt = "Without editing files, find the sample auth module. Without editing files, test the sample auth module.";
  const variantPrompt = "Without editing files, find the sample auth module. Without editing files, summarize the sample auth risk.";
  const seed = await runPipelineAndCollect({ label: "f2.seed", adapter, prompt: seedPrompt, cwd, env });
  const variant = await runPipelineAndCollect({ label: "f2.variant", adapter, prompt: variantPrompt, cwd, env });

  const assertions = [
    ensureOk(seed, "F2 seed"),
    ensureOk(variant, "F2 variant"),
    assertMetric("variant has cache hit", variant.metrics.cacheHits, ">= 1", variant.metrics.cacheHits >= 1),
    assertMetric(
      "variant skips at least one adapter execution",
      `${variant.metrics.adapterStarts}/${variant.metrics.taskRecords.length}`,
      "adapterStarts < taskRecords.length",
      variant.metrics.adapterStarts < variant.metrics.taskRecords.length,
    ),
    assertMetric("variant reports cacheHitRate", variant.metrics.cacheHitRate, "> 0", variant.metrics.cacheHitRate > 0),
    assertMetric("variant reports token savings", variant.metrics.tokensSavedByCache, "> 0", variant.metrics.tokensSavedByCache > 0),
  ].filter((value): value is AssertionResult => value !== null);

  return {
    scenario: {
      name: "F2 task-level cache",
      status: evaluateAssertions(assertions),
      assertions,
      runs: [seed.metrics, variant.metrics],
    },
    seedSession: seed.session,
  };
}

async function runRagScenario(adapter: Adapter, cwd: string, env: NodeJS.ProcessEnv, ragModelPresent: boolean): Promise<ScenarioResult> {
  if (!ragModelPresent) {
    return {
      name: "RAG semantic context reuse",
      status: "skipped",
      reason: "RAG embedding model not found; set RAG_EMBEDDING_MODEL_PATH to run this scenario.",
      assertions: [],
      runs: [],
    };
  }

  const seedPrompt = "Without editing files, analyze refresh-token replay risks in the sample auth module.";
  const probePrompt = "Without editing files, analyze token validation risks and reuse relevant prior auth context if available.";
  const seed = await runPipelineAndCollect({ label: "rag.seed", adapter, prompt: seedPrompt, cwd, env, noCache: true });
  const ragOn = await runPipelineAndCollect({ label: "rag.on", adapter, prompt: probePrompt, cwd, env, noCache: true });
  const ragOff = await runPipelineAndCollect({
    label: "rag.off",
    adapter,
    prompt: probePrompt,
    cwd,
    env,
    noCache: true,
    envOverride: { RAG_ENABLED: "0" },
  });

  const injectionOrBudgetDecision = ragOn.metrics.ragInjected >= 1 || ragOn.metrics.ragSkipReason === "budget";
  const assertions = [
    ensureOk(seed, "RAG seed"),
    ensureOk(ragOn, "RAG on"),
    ensureOk(ragOff, "RAG off"),
    assertMetric("RAG on finds context", ragOn.metrics.ragFound, ">= 1", ragOn.metrics.ragFound >= 1),
    assertMetric(
      "RAG on injects or records budget skip",
      { injected: ragOn.metrics.ragInjected, skipReason: ragOn.metrics.ragSkipReason },
      "injected >= 1 OR skipReason=budget",
      injectionOrBudgetDecision,
    ),
    assertMetric(
      "RAG does not reduce adapter starts by itself",
      `${ragOn.metrics.adapterStarts}/${ragOff.metrics.adapterStarts}`,
      "rag.on adapterStarts === rag.off adapterStarts",
      ragOn.metrics.adapterStarts === ragOff.metrics.adapterStarts,
    ),
  ].filter((value): value is AssertionResult => value !== null);

  return {
    name: "RAG semantic context reuse",
    status: evaluateAssertions(assertions),
    assertions,
    runs: [seed.metrics, ragOn.metrics, ragOff.metrics],
    observations: {
      ragTokenOverhead: ragOn.metrics.tokensAddedByRagContext,
      ragOffTokenOverhead: ragOff.metrics.tokensAddedByRagContext,
    },
  };
}

async function runSessionResumeScenario(
  adapter: Adapter,
  cwd: string,
  env: NodeJS.ProcessEnv,
  seedSession: SessionState | null,
): Promise<ScenarioResult> {
  if (!seedSession || seedSession.completed_task_ids.length < 2) {
    return {
      name: "session resume skips completed work",
      status: "skipped",
      reason: "F2 seed session did not produce at least two completed tasks.",
      assertions: [],
      runs: [],
    };
  }

  const firstTaskId = seedSession.completed_task_ids[0]!;
  const remainingTaskIds = seedSession.completed_task_ids.slice(1);
  const partialSessionId = `resume_${Date.now()}`;
  const partialSession = cloneSession(seedSession);
  partialSession.shared_context = {
    ...partialSession.shared_context,
    session_id: partialSessionId,
  };
  partialSession.completed_task_ids = [firstTaskId];
  partialSession.current_task_id = remainingTaskIds[0] ?? null;
  partialSession.task_results = {
    [firstTaskId]: seedSession.task_results[firstTaskId]!,
  };
  partialSession.updated_at = new Date().toISOString();
  await withEnv(env, () => SessionStateManager.saveSession(partialSession, cwd));

  const rawInput = String(seedSession.shared_context.raw_input ?? "");
  const resumed = await runPipelineAndCollect({
    label: "session.resume",
    adapter,
    prompt: rawInput,
    cwd,
    env,
    noCache: true,
    sessionId: partialSessionId,
    envOverride: { RAG_ENABLED: "0" },
  });
  const finalSession = await withEnv(env, () => SessionStateManager.loadSession(partialSessionId, cwd));

  const assertions = [
    ensureOk(resumed, "session resume"),
    assertMetric("resume skips completed task", resumed.metrics.executorSkips, ">= 1", resumed.metrics.executorSkips >= 1),
    assertMetric(
      "resume executes only remaining tasks",
      resumed.metrics.adapterStarts,
      String(remainingTaskIds.length),
      resumed.metrics.adapterStarts === remainingTaskIds.length,
    ),
    assertMetric(
      "final session has all completed tasks",
      finalSession.completed_task_ids.length,
      String(seedSession.completed_task_ids.length),
      finalSession.completed_task_ids.length >= seedSession.completed_task_ids.length,
    ),
    assertMetric(
      "first task output preserved",
      Boolean(finalSession.task_results[firstTaskId]?.raw_output),
      "true",
      Boolean(finalSession.task_results[firstTaskId]?.raw_output),
    ),
  ].filter((value): value is AssertionResult => value !== null);

  return {
    name: "session resume skips completed work",
    status: evaluateAssertions(assertions),
    assertions,
    runs: [resumed.metrics],
    observations: {
      partialSessionId,
      firstTaskId,
      remainingTaskIds,
    },
  };
}

function cloneSession(session: SessionState): SessionState {
  return JSON.parse(JSON.stringify(session)) as SessionState;
}

export async function runMemoryEffectsBenchmark(args: MemoryEffectsArgs): Promise<MemoryEffectsReport> {
  const hostRagModelPath = getRagModelPath() ?? null;
  const ragModelPresent = Boolean(hostRagModelPath && existsSync(hostRagModelPath));
  const detoksHome = mkdtempSync(join(tmpdir(), "detoks-memory-effects-home-"));
  const workspace = await createFixtureWorkspace();
  const env = buildTempEnv(detoksHome, ragModelPresent ? hostRagModelPath : null);
  const scenarios: ScenarioResult[] = [];

  try {
    scenarios.push(await runF1Scenario(args.adapter, workspace, env));
    const f2 = await runF2Scenario(args.adapter, workspace, env);
    scenarios.push(f2.scenario);
    scenarios.push(await runRagScenario(args.adapter, workspace, env, ragModelPresent));
    scenarios.push(await runSessionResumeScenario(args.adapter, workspace, env, f2.seedSession));

    return buildReport(args.adapter, detoksHome, workspace, hostRagModelPath, ragModelPresent, scenarios);
  } finally {
    if (!args.keepTemp) {
      rmSync(detoksHome, { recursive: true, force: true });
      rmSync(workspace, { recursive: true, force: true });
    }
  }
}

function buildReport(
  adapter: Adapter,
  detoksHome: string,
  workspace: string,
  ragModelPath: string | null,
  ragModelPresent: boolean,
  scenarios: ScenarioResult[],
): MemoryEffectsReport {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    adapter,
    executionMode: "real",
    detoksHome,
    workspace,
    ragModelPath,
    ragModelPresent,
    scenarios,
    summary: {
      passed: scenarios.filter((scenario) => scenario.status === "passed").length,
      failed: scenarios.filter((scenario) => scenario.status === "failed").length,
      skipped: scenarios.filter((scenario) => scenario.status === "skipped").length,
    },
  };
}

async function writeReport(outputPath: string, report: MemoryEffectsReport): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
}

async function main(): Promise<void> {
  try {
    const args = parseArgs();
    const report = await runMemoryEffectsBenchmark(args);
    const serialized = JSON.stringify(report, null, 2);
    if (args.output) {
      const outputPath = resolve(args.output);
      await writeReport(outputPath, report);
      console.log(`✅ Memory effects benchmark result saved to: ${outputPath}`);
    } else {
      console.log(serialized);
    }

    if (report.summary.failed > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("❌ Memory effects benchmark failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

function isMainModule(): boolean {
  const entryPath = process.argv[1];
  return entryPath !== undefined && resolve(entryPath) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  void main();
}
