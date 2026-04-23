import type { Adapter, ExecutionMode } from "../../core/pipeline/types.js";
import type { AdapterExecutionRequest, AdapterExecutionResult } from "../../core/executor/types.js";
import type { SubprocessRequest, SubprocessRunner } from "../subprocess/types.js";

export type AdapterExecutionMode = ExecutionMode;

export interface AdapterExecutionContext {
  executionMode: AdapterExecutionMode;
  subprocessRunner: SubprocessRunner;
}

export interface CliAdapter {
  readonly target: Adapter;
  buildSubprocessRequest(request: AdapterExecutionRequest): SubprocessRequest;
  execute(
    request: AdapterExecutionRequest,
    context?: AdapterExecutionContext,
  ): Promise<AdapterExecutionResult>;
}
