import type { Adapter } from "../../core/pipeline/types.js";
import type { AdapterExecutionRequest, AdapterExecutionResult } from "../../core/executor/types.js";
import type { SubprocessRunner } from "../subprocess/types.js";

export interface AdapterExecutionContext {
  subprocessRunner: SubprocessRunner;
}

export interface CliAdapter {
  readonly target: Adapter;
  execute(
    request: AdapterExecutionRequest,
    context?: AdapterExecutionContext,
  ): Promise<AdapterExecutionResult>;
}
