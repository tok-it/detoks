import type { Adapter } from "../../core/pipeline/types.js";
import type { AdapterExecutionRequest, AdapterExecutionResult } from "../../core/executor/types.js";

export interface CliAdapter {
  readonly target: Adapter;
  execute(request: AdapterExecutionRequest): Promise<AdapterExecutionResult>;
}
