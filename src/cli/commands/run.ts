import { orchestratePipeline } from "../../core/pipeline/orchestrator.js";
import type { CliExecutionResult, NormalizedCliRequest } from "../types.js";

/**
 * CLI boundary function.
 * Execution orchestration lives in core/pipeline.
 */
export const runCommand = async (request: NormalizedCliRequest): Promise<CliExecutionResult> =>
  orchestratePipeline(request);
