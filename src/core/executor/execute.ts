import type { Adapter } from "../pipeline/types.js";
import type { ExecutorRequest, ExecutorResult } from "./types.js";
import type { CliAdapter } from "../../integrations/adapters/interface.js";
import { CodexStubAdapter } from "../../integrations/adapters/codex/adapter.js";
import { ClaudeStubAdapter } from "../../integrations/adapters/claude/adapter.js";
import { GeminiStubAdapter } from "../../integrations/adapters/gemini/adapter.js";
import {
  createStubSubprocessRunner,
  createPtySubprocessRunner,
} from "../../integrations/subprocess/runner.js";

const adapterRegistry: Record<Adapter, CliAdapter> = {
  codex: new CodexStubAdapter(),
  gemini: new GeminiStubAdapter(),
  "claude": new ClaudeStubAdapter(),
};

export const getAdapter = (adapter: Adapter): CliAdapter => adapterRegistry[adapter];

export const executeWithAdapter = async (request: ExecutorRequest): Promise<ExecutorResult> => {
  const adapter = getAdapter(request.adapter);
  const subprocessRunner =
    request.executionMode === "real"
      ? createPtySubprocessRunner(
          {
            ...(request.onAdapterEvent ? { onEvent: request.onAdapterEvent } : {}),
            ...(request.onPtyController ? { onController: request.onPtyController } : {}),
            ...(request.presentationMode === "passthrough" ? { passthroughUi: true } : {}),
          },
        )
      : createStubSubprocessRunner();
  const result = await adapter.execute({
    mode: request.mode,
    prompt: request.prompt,
    verbose: request.verbose,
    ...(request.model !== undefined ? { model: request.model } : {}),
    ...(request.taskType !== undefined ? { taskType: request.taskType } : {}),
    ...(request.cwd !== undefined ? { cwd: request.cwd } : {}),
    ...(request.sessionId !== undefined ? { sessionId: request.sessionId } : {}),
    ...(request.presentationMode !== undefined ? { presentationMode: request.presentationMode } : {}),
  }, {
    executionMode: request.executionMode,
    subprocessRunner,
    ...(request.onActionTimelineEvent ? { onActionTimelineEvent: request.onActionTimelineEvent } : {}),
  });

  return {
    ok: result.success,
    adapter: request.adapter,
    rawOutput: result.rawOutput,
    exitCode: result.exitCode,
    ...(result.stderr !== undefined ? { stderr: result.stderr } : {}),
    ...(result.transcript !== undefined ? { transcript: result.transcript } : {}),
  };
};
