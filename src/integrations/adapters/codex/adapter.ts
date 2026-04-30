import type { AdapterExecutionRequest, AdapterExecutionResult } from "../../../core/executor/types.js";
import type { AdapterExecutionContext, CliAdapter } from "../interface.js";
import { getCodexReasoningEffortOverride } from "../../../cli/config/config-manager.js";
import { executeAdapterViaSubprocess } from "../real.js";
import { buildStubRawOutput } from "../stub.js";

export class CodexStubAdapter implements CliAdapter {
  readonly target = "codex" as const;

  buildSubprocessRequest(request: AdapterExecutionRequest) {
    const reasoningEffort = getCodexReasoningEffortOverride();

    return {
      command: "codex",
      args: [
        "exec",
        ...(reasoningEffort ? ["-c", `model_reasoning_effort=${reasoningEffort}`] : []),
        ...(request.model ? ["--model", request.model] : []),
        "-",
        "--sandbox",
        "workspace-write",
        "--skip-git-repo-check",
        "--color",
        "never",
      ],
      ...(request.cwd !== undefined ? { cwd: request.cwd } : {}),
      input: request.prompt,
    };
  }

  async execute(
    request: AdapterExecutionRequest,
    context?: AdapterExecutionContext,
  ): Promise<AdapterExecutionResult> {
    if (context?.executionMode === "real") {
      return executeAdapterViaSubprocess(this, request, context);
    }

    return {
      success: true,
      rawOutput: buildStubRawOutput(this.target, request.prompt),
      exitCode: 0,
    };
  }
}
