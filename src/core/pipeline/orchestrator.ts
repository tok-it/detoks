import { executeWithAdapter } from "../executor/execute.js";
import type { PipelineExecutionRequest, PipelineExecutionResult } from "./types.js";

const buildStages = (): PipelineExecutionResult["stages"] => [
  { name: "Prompt Compiler", owner: "role1", status: "stubbed" },
  { name: "Request Analyzer", owner: "role1", status: "stubbed" },
  { name: "Task Graph Builder", owner: "role2.1", status: "stubbed" },
  { name: "Context Optimizer", owner: "role2.2", status: "stubbed" },
  { name: "Executor", owner: "role3", status: "ready" },
  { name: "State Manager", owner: "role2.2", status: "stubbed" },
];

/**
 * Core pipeline orchestration boundary (stub).
 * Stage internals remain owned by each role and are intentionally not implemented here.
 */
export const orchestratePipeline = async (
  request: PipelineExecutionRequest,
): Promise<PipelineExecutionResult> => {
  const prompt = request.userRequest.raw_input;
  const execution = await executeWithAdapter({
    adapter: request.adapter,
    mode: request.mode,
    prompt,
    verbose: request.verbose,
    ...(request.userRequest.cwd !== undefined ? { cwd: request.userRequest.cwd } : {}),
    ...(request.userRequest.session_id !== undefined
      ? { sessionId: request.userRequest.session_id }
      : {}),
  });

  return {
    ok: execution.ok,
    mode: request.mode,
    adapter: request.adapter,
    summary: `stub executor accepted prompt (${prompt.length} chars)`,
    nextAction: "connect core pipeline modules behind this boundary",
    stages: buildStages(),
    rawOutput: execution.rawOutput,
  };
};
