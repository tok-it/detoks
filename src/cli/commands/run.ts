import { orchestratePipeline } from "../../core/pipeline/orchestrator.js";
import type { CliExecutionResult, NormalizedCliRequest } from "../types.js";
import { ProjectDetector } from "../ProjectDetector.js";

/**
 * CLI boundary function.
 * Execution orchestration lives in core/pipeline.
 */
export const runCommand = async (request: NormalizedCliRequest): Promise<CliExecutionResult> => {
  const projectInfo = await ProjectDetector.detect(request.userRequest.cwd);
  return orchestratePipeline({
    ...request,
    projectInfo,
  });
};
