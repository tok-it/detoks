import type { Adapter, ExecutionMode, InteractionMode } from "../pipeline/types.js";
import type { RequestCategory } from "../../schemas/pipeline.js";
import type { PtyTranscript } from "../../integrations/subprocess/types.js";

export interface AdapterExecutionRequest {
  mode: InteractionMode;
  prompt: string;
  verbose: boolean;
  model?: string;
  taskType?: RequestCategory;
  cwd?: string;
  sessionId?: string;
}

export interface AdapterExecutionResult {
  success: boolean;
  rawOutput: string;
  exitCode: number;
  stderr?: string;
  transcript?: PtyTranscript; // PTY 실행 기록 (optional)
}

export interface ExecutorRequest extends AdapterExecutionRequest {
  adapter: Adapter;
  executionMode: ExecutionMode;
}

export interface ExecutorResult {
  ok: boolean;
  adapter: Adapter;
  rawOutput: string;
  exitCode: number;
  stderr?: string;
  transcript?: PtyTranscript; // PTY 실행 기록 (optional)
}
