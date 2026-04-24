import type { Adapter } from "../pipeline/types.js";
import type { ExecutorRequest, ExecutorResult } from "./types.js";
import type { CliAdapter } from "../../integrations/adapters/interface.js";
import { CodexStubAdapter } from "../../integrations/adapters/codex/adapter.js";
import { GeminiStubAdapter } from "../../integrations/adapters/gemini/adapter.js";
import {
  createRealSubprocessRunner,
  createStubSubprocessRunner,
} from "../../integrations/subprocess/runner.js";

const adapterRegistry: Record<Adapter, CliAdapter> = {
  codex: new CodexStubAdapter(),
  gemini: new GeminiStubAdapter(),
};

export const getAdapter = (adapter: Adapter): CliAdapter => adapterRegistry[adapter];

export const executeWithAdapter = async (request: ExecutorRequest): Promise<ExecutorResult> => {
  const adapter = getAdapter(request.adapter);
  const subprocessRunner =
    request.executionMode === "real"
      ? createRealSubprocessRunner()
      : createStubSubprocessRunner();
  const result = await adapter.execute({
    mode: request.mode,
    prompt: request.prompt,
    verbose: request.verbose,
    ...(request.cwd !== undefined ? { cwd: request.cwd } : {}),
    ...(request.sessionId !== undefined ? { sessionId: request.sessionId } : {}),
  }, {
    executionMode: request.executionMode,
    subprocessRunner,
  });

  return {
    ok: result.success,
    adapter: request.adapter,
    rawOutput: result.rawOutput,
    exitCode: result.exitCode,
    ...(result.stderr !== undefined ? { stderr: result.stderr } : {}),
  };
};
