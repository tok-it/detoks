import type { Adapter, InteractionMode } from "../pipeline/types.js";

export interface AdapterExecutionRequest {
  mode: InteractionMode;
  prompt: string;
  verbose: boolean;
  cwd?: string;
  sessionId?: string;
}

export interface AdapterExecutionResult {
  success: boolean;
  rawOutput: string;
  exitCode: number;
  stderr?: string;
}

export interface ExecutorRequest extends AdapterExecutionRequest {
  adapter: Adapter;
}

export interface ExecutorResult {
  ok: boolean;
  adapter: Adapter;
  rawOutput: string;
  exitCode: number;
  stderr?: string;
}
