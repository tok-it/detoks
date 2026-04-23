import type { CliExecutionResult, NormalizedCliRequest } from "../types.js";

const buildStages = (): CliExecutionResult["stages"] => [
  { name: "Prompt Compiler", owner: "role1", status: "stubbed" },
  { name: "Request Analyzer", owner: "role1", status: "stubbed" },
  { name: "Task Graph Builder", owner: "role2.1", status: "stubbed" },
  { name: "Context Optimizer", owner: "role2.2", status: "stubbed" },
  { name: "Executor", owner: "role3", status: "ready" },
  { name: "State Manager", owner: "role2.2", status: "stubbed" },
];

/**
 * Thin orchestration boundary for one-shot execution.
 * Real stage implementations are intentionally delegated to their owners.
 */
export const runCommand = async (request: NormalizedCliRequest): Promise<CliExecutionResult> => {
  const prompt = request.userRequest.raw_input;
  const shortPrompt = prompt.length > 96 ? `${prompt.slice(0, 93)}...` : prompt;

  return {
    ok: true,
    mode: request.mode,
    adapter: request.adapter,
    summary: `stub executor accepted prompt (${prompt.length} chars)`,
    nextAction: "connect core pipeline modules behind this boundary",
    stages: buildStages(),
    rawOutput: `[stub:${request.adapter}] ${shortPrompt}`,
  };
};
