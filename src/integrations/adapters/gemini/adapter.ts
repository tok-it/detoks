import type { AdapterExecutionRequest, AdapterExecutionResult } from "../../../core/executor/types.js";
import type { CliAdapter } from "../interface.js";
import { buildStubRawOutput } from "../stub.js";

export class GeminiStubAdapter implements CliAdapter {
  readonly target = "gemini" as const;

  async execute(request: AdapterExecutionRequest): Promise<AdapterExecutionResult> {
    return {
      success: true,
      rawOutput: buildStubRawOutput(this.target, request.prompt),
      exitCode: 0,
    };
  }
}
