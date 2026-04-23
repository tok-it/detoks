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

export const AdapterValues = CoreAdapterValues;
export const ExecutionModeValues = CoreExecutionModeValues;
export type CliMode = InteractionMode;

export interface CliArgs {
  mode: CliMode;
  prompt?: string;
  adapter: Adapter;
  executionMode: ExecutionMode;
  verbose: boolean;
}

export type NormalizedCliRequest = PipelineExecutionRequest;
export type CliExecutionResult = PipelineExecutionResult;
