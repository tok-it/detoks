import { promises as fs } from 'fs';
import { join } from 'path';
import { get_encoding } from 'tiktoken';
import type { ZodSchema } from 'zod';
import {
  formatTraceFailureMessage,
  formatTraceLabel,
  formatTraceWarningPrefix,
} from './terminal-log-style.js';

export interface TraceEntry {
  timestamp: string;
  stage: string;
  phase: 'input' | 'output';
  role: string;
  dataType: string;
  data: unknown;
  schemaValid: boolean;
  schemaErrors?: string[];
  durationMs?: number;
  memoryMb?: number;
  estimatedTokens?: number;
}

export interface TraceLog {
  sessionId: string;
  startTime: string;
  entries: TraceEntry[];
  summary?: {
    totalDurationMs: number;
    stageTimings: Record<string, number>;
    totalMemoryMb: number;
  };
}

const TRACE_DIR = 'local_config/trace';
const traces = new Map<string, TraceEntry[]>();
const stageTiming = new Map<string, { start: number; end?: number }>();

let _enc: ReturnType<typeof get_encoding> | null = null;
function getEncoder() {
  if (!_enc) _enc = get_encoding('cl100k_base');
  return _enc;
}

function estimateTokenCount(data: unknown): number {
  try {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    return getEncoder().encode(text).length;
  } catch {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    return Math.ceil(text.length / 4);
  }
}

export class PipelineTracer {
  /**
   * 파이프라인의 각 단계를 추적합니다.
   * 입력 데이터, 변환 결과, 스키마 검증을 자동으로 기록합니다.
   */
  static async trace(options: {
    sessionId: string;
    stage: string;
    role: string;
    phase: 'input' | 'output';
    dataType: string;
    data: unknown;
    schema?: ZodSchema;
    durationMs?: number;
  }): Promise<void> {
    const {
      sessionId,
      stage,
      role,
      phase,
      dataType,
      data,
      schema,
      durationMs,
    } = options;

    // 스키마 검증
    let schemaValid = true;
    let schemaErrors: string[] | undefined;

    if (schema) {
      const result = schema.safeParse(data);
      schemaValid = result.success;
      if (!schemaValid && 'error' in result) {
        schemaErrors = result.error.issues.map(
          (issue) => `${issue.path.map(String).join('.')}: ${issue.message}`
        );
      }
    }

    const estimatedTokens = estimateTokenCount(data);

    const entry: TraceEntry = {
      timestamp: new Date().toISOString(),
      stage,
      phase,
      role,
      dataType,
      data,
      schemaValid,
      ...(schemaErrors !== undefined ? { schemaErrors } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      memoryMb: process.memoryUsage().heapUsed / 1024 / 1024,
      estimatedTokens,
    };

    // 메모리에 저장
    if (!traces.has(sessionId)) {
      traces.set(sessionId, []);
    }
    traces.get(sessionId)!.push(entry);

    // 환경변수로 실시간 로깅
    if (process.env.DETOKS_TRACE === '1') {
      console.error(
        `${formatTraceLabel()} ${stage} (${role}) ${phase}: ${dataType}`,
      );
      if (!schemaValid && schemaErrors) {
        console.error(
          `  ${formatTraceWarningPrefix()} ${formatTraceFailureMessage("Schema validation failed:")}`,
          schemaErrors,
        );
      }
    }
  }

  /**
   * 단계 실행 시간을 기록합니다.
   */
  static startStage(stage: string): void {
    stageTiming.set(stage, { start: Date.now() });
  }

  static endStage(stage: string): number {
    const timing = stageTiming.get(stage);
    if (!timing) return 0;
    const durationMs = Date.now() - timing.start;
    stageTiming.set(stage, { ...timing, end: Date.now() });
    return durationMs;
  }

  /**
   * 추적 로그를 파일에 저장합니다.
   */
  static async saveTrace(sessionId: string): Promise<string> {
    try {
      await fs.mkdir(TRACE_DIR, { recursive: true });

      const entries = traces.get(sessionId) || [];
      const stageTimings: Record<string, number> = {};
      stageTiming.forEach((timing, stage) => {
        if (timing.end) {
          stageTimings[stage] = timing.end - timing.start;
        }
      });

      const trace: TraceLog = {
        sessionId,
        startTime: new Date().toISOString(),
        entries,
        summary: {
          totalDurationMs: Object.values(stageTimings).reduce((a, b) => a + b, 0),
          stageTimings,
          totalMemoryMb: Math.max(
            ...entries.map((e) => e.memoryMb || 0)
          ),
        },
      };

      const filePath = join(TRACE_DIR, `${sessionId}-trace.json`);
      await fs.writeFile(filePath, JSON.stringify(trace, null, 2), 'utf-8');

      return filePath;
    } catch (error) {
      console.error(
        `${formatTraceLabel()} ${formatTraceFailureMessage(`Failed to save trace: ${String(error)}`)}`,
      );
      throw error;
    }
  }

  /**
   * 메모리에 있는 추적 로그를 가져옵니다.
   */
  static getTrace(sessionId: string): TraceLog {
    const entries = traces.get(sessionId) || [];
    const stageTimings: Record<string, number> = {};
    stageTiming.forEach((timing, stage) => {
      if (timing.end) {
        stageTimings[stage] = timing.end - timing.start;
      }
    });

    return {
      sessionId,
      startTime: entries[0]?.timestamp || new Date().toISOString(),
      entries,
      summary: {
        totalDurationMs: Object.values(stageTimings).reduce((a, b) => a + b, 0),
        stageTimings,
        totalMemoryMb: Math.max(...entries.map((e) => e.memoryMb || 0)),
      },
    };
  }

  /**
   * 추적 로그를 마크다운 형식으로 포맷합니다.
   */
  static formatAsMarkdown(trace: TraceLog): string {
    const lines: string[] = [];

    lines.push(`# Pipeline Trace Report`);
    lines.push(`**Session ID**: ${trace.sessionId}`);
    lines.push(`**Start Time**: ${trace.startTime}`);
    lines.push('');

    if (trace.summary) {
      lines.push(`## Summary`);
      lines.push(`- **Total Duration**: ${trace.summary.totalDurationMs}ms`);
      lines.push(`- **Peak Memory**: ${trace.summary.totalMemoryMb.toFixed(2)}MB`);
      lines.push('');

      lines.push(`## Stage Timings`);
      for (const [stage, duration] of Object.entries(trace.summary.stageTimings)) {
        lines.push(`- **${stage}**: ${duration}ms`);
      }
      lines.push('');
    }

    lines.push(`## Entries (${trace.entries.length})`);
    for (const entry of trace.entries) {
      const status = entry.schemaValid ? '✅' : '⚠️';
      lines.push(`### ${status} ${entry.stage} (${entry.role}) — ${entry.phase}`);
      lines.push(`- **Type**: ${entry.dataType}`);
      lines.push(`- **Timestamp**: ${entry.timestamp}`);
      lines.push(`- **Memory**: ${entry.memoryMb?.toFixed(2)}MB`);
      if (entry.estimatedTokens) {
        lines.push(`- **Estimated Tokens**: ${entry.estimatedTokens}`);
      }
      if (entry.durationMs) {
        lines.push(`- **Duration**: ${entry.durationMs}ms`);
      }
      if (!entry.schemaValid && entry.schemaErrors) {
        lines.push(`- **Schema Errors**:`);
        for (const error of entry.schemaErrors) {
          lines.push(`  - ${error}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 모든 추적 데이터를 초기화합니다.
   */
  static clear(): void {
    traces.clear();
    stageTiming.clear();
  }
}
