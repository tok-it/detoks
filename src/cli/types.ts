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
  command?:
    | "session-list"
    | "session-continue"
    | "session-fork"
    | "session-reset"
    | "checkpoint-list"
    | "checkpoint-show"
    | "checkpoint-restore";
  prompt?: string;
  sessionId?: string;
  newSessionId?: string;
  checkpointId?: string;
  inputFile?: string;
  human?: boolean;
  adapter: Adapter;
  executionMode: ExecutionMode;
  verbose: boolean;
  trace: boolean;
  showHelp: boolean;
  helpTopic?:
    | "main"
    | "repl"
    | "session-list"
    | "session-continue"
    | "session-reset"
    | "session-fork"
    | "checkpoint-list"
    | "checkpoint-show"
    | "checkpoint-restore";
}

export type NormalizedCliRequest = PipelineExecutionRequest;
export type CliExecutionResult = PipelineExecutionResult;
export type CliBatchExecutionResult = BatchPipelineResult;
