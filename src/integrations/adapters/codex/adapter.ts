import type { AdapterExecutionRequest, AdapterExecutionResult } from "../../../core/executor/types.js";
import type { AdapterExecutionContext, CliAdapter } from "../interface.js";
import { buildStubRawOutput } from "../stub.js";

export class CodexStubAdapter implements CliAdapter {
  readonly target = "codex" as const;

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
