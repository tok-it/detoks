import type { AdapterExecutionRequest, AdapterExecutionResult } from "../../../core/executor/types.js";
import type { AdapterExecutionContext, CliAdapter } from "../interface.js";
import { executeAdapterViaSubprocess } from "../real.js";
import { buildStubRawOutput } from "../stub.js";

const CLAUDE_PERMISSION_MODE = "default" as const;

export class ClaudeStubAdapter implements CliAdapter {
  readonly target = "claude" as const;

  buildSubprocessRequest(request: AdapterExecutionRequest) {
    return {
      command: "claude",
      args: [
        "-p",
        "--output-format",
        "text",
        "--permission-mode",
        CLAUDE_PERMISSION_MODE,
        ...(request.model ? ["--model", request.model] : []),
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
