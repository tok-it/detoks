import type { AdapterExecutionRequest, AdapterExecutionResult } from "../../../core/executor/types.js";
import type { AdapterExecutionContext, CliAdapter } from "../interface.js";
import { buildStubRawOutput } from "../stub.js";

export class GeminiStubAdapter implements CliAdapter {
  readonly target = "gemini" as const;

  buildSubprocessRequest(request: AdapterExecutionRequest) {
    return {
      command: "gemini",
      args: [],
      ...(request.cwd !== undefined ? { cwd: request.cwd } : {}),
      input: request.prompt,
    };
  }

  async execute(
    request: AdapterExecutionRequest,
    _context?: AdapterExecutionContext,
  ): Promise<AdapterExecutionResult> {
    return {
      success: true,
      rawOutput: buildStubRawOutput(this.target, request.prompt),
      exitCode: 0,
    };
  }
}
