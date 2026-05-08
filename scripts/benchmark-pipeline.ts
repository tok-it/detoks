#!/usr/bin/env tsx

import { get_encoding } from 'tiktoken';
import { fileURLToPath } from 'url';
import { orchestratePipeline } from '../src/core/pipeline/orchestrator.js';
import { loadRole1RuntimeConfig } from '../src/core/prompt/config.js';
import { SessionStateManager } from '../src/core/state/SessionStateManager.js';
import { OutputAnalyzer } from '../src/core/utils/OutputAnalyzer.js';
import { promises as fs } from 'fs';
import { dirname, resolve } from 'path';

type RuntimeProvider = 'llama-server' | 'node-llama-cpp';

interface BenchmarkArgs {
  input: string;
  adapter: 'codex' | 'gemini';
  executionMode: 'stub' | 'real';
  output?: string;
  runtimeProvider?: RuntimeProvider;
  verbose: boolean;
}

interface BenchmarkResult {
  input: string;
  adapter: 'codex' | 'gemini';
  executionMode: 'stub' | 'real';
  runtime?: {
    provider: RuntimeProvider;
    model: string;
    api_base: string;
  };

  compression: {
    input_tokens_before: number;
    input_tokens_after: number;
    reduction_percent: number;
  };

  session: {
    session_id: string;
    tasks_total: number;
    tasks_completed: number;
    tasks_failed: number;
    duration_ms: number;
  };

  output_analysis: {
    total_chars: number;
    estimated_tokens: number;
    line_count: number;
    code_block_count: number;
    function_count: number;
    has_error_handling: boolean;
    has_comments: boolean;
    parse_success: boolean;
  };

  total_duration_ms: number;

  trace_summary?: {
    stage_count: number;
    schema_errors: number;
    estimated_total_tokens: number;
  };
}

function getUsage(): string {
  return [
    'Usage: npm run benchmark -- --input "your prompt" [--adapter codex|gemini] [--execution-mode stub|real] [--runtime-provider llama-server|node-llama-cpp] [--output file.json] [--verbose]',
  ].join('\n');
}

export function parseArgs(argv: string[] = process.argv.slice(2)): BenchmarkArgs {
  const args = argv;
  const result: Partial<BenchmarkArgs> = {
    verbose: false,
    adapter: 'codex',
    executionMode: 'stub',
  };

  for (let i = 0; i < args.length; i++) {
    const current = args[i];
    const next = args[i + 1];

    if (current === '--input' && next !== undefined) {
      result.input = next;
      i += 1;
    } else if (current === '--help' || current === '-h') {
      console.log(getUsage());
      process.exit(0);
    } else if (current === '--adapter' && next !== undefined) {
      result.adapter = next as 'codex' | 'gemini';
      i += 1;
    } else if (current === '--execution-mode' && next !== undefined) {
      result.executionMode = next as 'stub' | 'real';
      i += 1;
    } else if (current === '--runtime-provider' && next !== undefined) {
      result.runtimeProvider = next as RuntimeProvider;
      i += 1;
    } else if (current === '--output' && next !== undefined) {
      result.output = next;
      i += 1;
    } else if (current === '--verbose') {
      result.verbose = true;
    }
  }

  if (!result.input) {
    console.error(getUsage());
    process.exit(1);
  }

  if (
    result.runtimeProvider !== undefined &&
    result.runtimeProvider !== 'llama-server' &&
    result.runtimeProvider !== 'node-llama-cpp'
  ) {
    throw new Error(
      '--runtime-provider must be one of: llama-server, node-llama-cpp',
    );
  }

  return result as BenchmarkArgs;
}

export function buildScriptEnv(
  args: Pick<BenchmarkArgs, 'runtimeProvider'>,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...(args.runtimeProvider
      ? { LOCAL_LLM_RUNTIME_PROVIDER: args.runtimeProvider }
      : {}),
  };
}

let _enc: ReturnType<typeof get_encoding> | null = null;
function countTokens(text: string): number {
  try {
    if (!_enc) _enc = get_encoding('cl100k_base');
    return _enc.encode(text).length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}

async function runBenchmark(args: BenchmarkArgs): Promise<BenchmarkResult> {
  const startTime = Date.now();
  const scriptEnv = buildScriptEnv(args);
  const runtimeConfig = loadRole1RuntimeConfig({ env: scriptEnv });

  if (args.verbose) {
    console.log(`[Benchmark] Input: ${args.input.substring(0, 50)}...`);
    console.log(
      `[Benchmark] Runtime provider: ${runtimeConfig.localLlmRuntimeProvider}`,
    );
  }

  // 1. 입력 토큰 계산 (압축 전)
  const inputTokensBefore = countTokens(args.input);
  if (args.verbose) {
    console.log(`[Benchmark] Input tokens (before): ${inputTokensBefore}`);
  }

  // 2. orchestratePipeline 실행
  const pipelineStartTime = Date.now();
  const result = await orchestratePipeline({
    mode: 'run',
    adapter: args.adapter,
    executionMode: args.executionMode,
    verbose: args.verbose,
    trace: true,
    userRequest: { raw_input: args.input },
    env: scriptEnv,
  });
  const pipelineDuration = Date.now() - pipelineStartTime;

  if (args.verbose) {
    console.log(`[Benchmark] Pipeline duration: ${pipelineDuration}ms`);
  }

  // 3. 압축된 프롬프트 토큰 계산
  const inputTokensAfter = result.compiledPrompt
    ? countTokens(result.compiledPrompt)
    : 0;
  const compressionReduction = inputTokensBefore > 0
    ? ((inputTokensBefore - inputTokensAfter) / inputTokensBefore) * 100
    : 0;

  if (args.verbose) {
    console.log(`[Benchmark] Input tokens (after): ${inputTokensAfter}`);
    console.log(`[Benchmark] Reduction: ${compressionReduction.toFixed(2)}%`);
  }

  // 4. 세션 상태 로드
  const session = await SessionStateManager.loadSession(result.sessionId);
  const tasksCompleted = session.completed_task_ids.length;
  const tasksFailed = result.taskRecords.filter(r => r.status === 'failed').length;

  if (args.verbose) {
    console.log(`[Benchmark] Tasks completed: ${tasksCompleted}, failed: ${tasksFailed}`);
  }

  // 5. 출력 분석
  const outputAnalysis = OutputAnalyzer.analyze(result.rawOutput);

  if (args.verbose) {
    console.log(`[Benchmark] Output analysis: ${JSON.stringify(outputAnalysis, null, 2)}`);
  }

  // 6. 추적 요약
  let traceSummary: BenchmarkResult['trace_summary'] | undefined;
  if (result.traceLog) {
    const schemaErrors = result.traceLog.entries
      .filter(e => !e.schemaValid).length;
    const totalTokens = result.traceLog.entries
      .reduce((sum, e) => sum + (e.estimatedTokens ?? 0), 0);

    traceSummary = {
      stage_count: result.traceLog.entries.length,
      schema_errors: schemaErrors,
      estimated_total_tokens: totalTokens,
    };

    if (args.verbose) {
      console.log(`[Benchmark] Trace summary: ${JSON.stringify(traceSummary, null, 2)}`);
    }
  }

  return {
    input: args.input,
    adapter: args.adapter,
    executionMode: args.executionMode,
    runtime: {
      provider: runtimeConfig.localLlmRuntimeProvider ?? 'llama-server',
      model: runtimeConfig.localLlmModelName ?? '(not set)',
      api_base: runtimeConfig.localLlmApiBase ?? '(not set)',
    },
    compression: {
      input_tokens_before: inputTokensBefore,
      input_tokens_after: inputTokensAfter,
      reduction_percent: parseFloat(compressionReduction.toFixed(2)),
    },
    session: {
      session_id: result.sessionId,
      tasks_total: result.taskRecords.length,
      tasks_completed: tasksCompleted,
      tasks_failed: tasksFailed,
      duration_ms: pipelineDuration,
    },
    total_duration_ms: Date.now() - startTime,
    output_analysis: outputAnalysis,
    ...(traceSummary ? { trace_summary: traceSummary } : {}),
  };
}

async function main() {
  const args = parseArgs();

  try {
    const result = await runBenchmark(args);

    if (args.verbose) {
      console.log('\n=== Benchmark Result ===\n');
      console.log(JSON.stringify(result, null, 2));
    }

    // 파일 저장
    if (args.output) {
      const outputDir = dirname(args.output);
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(args.output, JSON.stringify(result, null, 2), 'utf-8');
      console.log(`✅ Benchmark result saved to: ${args.output}`);
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

function isMainModule(): boolean {
  const entryPath = process.argv[1];
  return entryPath !== undefined && resolve(entryPath) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  void main();
}
