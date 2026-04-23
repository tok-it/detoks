import { AdapterValues as CoreAdapterValues } from "../core/pipeline/types.js";
import type {
  Adapter,
  InteractionMode,
  PipelineExecutionRequest,
  PipelineExecutionResult,
} from "../core/pipeline/types.js";

export const AdapterValues = CoreAdapterValues;
export type CliMode = InteractionMode;

export interface CliArgs {
  mode: CliMode;
  prompt?: string;
  adapter: Adapter;
  verbose: boolean;
}

export type NormalizedCliRequest = PipelineExecutionRequest;
export type CliExecutionResult = PipelineExecutionResult;
