import {
  AdapterValues as CoreAdapterValues,
  ExecutionModeValues as CoreExecutionModeValues,
} from "../core/pipeline/types.js";
import type {
  Adapter,
  InteractionMode,
  ExecutionMode,
  PipelineExecutionRequest,
  PipelineExecutionResult,
} from "../core/pipeline/types.js";
import type { BatchPipelineResult } from "../schemas/pipeline.js";

export const AdapterValues = CoreAdapterValues;
export const ExecutionModeValues = CoreExecutionModeValues;
export type CliMode = InteractionMode;

export interface CliArgs {
  mode: CliMode;
  command?: "checkpoint-list" | "checkpoint-show";
  prompt?: string;
  sessionId?: string;
  checkpointId?: string;
  inputFile?: string;
  adapter: Adapter;
  executionMode: ExecutionMode;
  verbose: boolean;
  trace: boolean;
  showHelp: boolean;
  helpTopic?: "main" | "repl" | "checkpoint-list" | "checkpoint-show";
}

export type NormalizedCliRequest = PipelineExecutionRequest;
export type CliExecutionResult = PipelineExecutionResult;
export type CliBatchExecutionResult = BatchPipelineResult;
