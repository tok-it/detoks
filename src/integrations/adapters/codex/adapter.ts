import type { AdapterExecutionRequest, AdapterExecutionResult } from "../../../core/executor/types.js";
import type { AdapterExecutionContext, CliAdapter } from "../interface.js";
import { getCodexReasoningEffortOverride } from "../../../cli/config/config-manager.js";
import { executeAdapterViaSubprocess } from "../real.js";
import { buildStubRawOutput } from "../stub.js";

export class CodexStubAdapter implements CliAdapter {
  readonly target = "codex" as const;

  buildSubprocessRequest(request: AdapterExecutionRequest) {
    const reasoningEffort = getCodexReasoningEffortOverride();

    if (request.presentationMode === "passthrough") {
      const promptBytes = Buffer.byteLength(request.prompt ?? "", "utf8");
      if (promptBytes > 200_000) {
        throw new Error(
          `passthrough 모드에서 prompt가 너무 큽니다 (${promptBytes} bytes). ` +
          `200,000 bytes 이하로 줄이거나 embedded-pane 모드를 사용하세요.`,
        );
      }
      return {
        command: "codex",
        args: [
          ...(reasoningEffort ? ["-c", `model_reasoning_effort=${reasoningEffort}`] : []),
          ...(request.model ? ["--model", request.model] : []),
          "--sandbox",
          "workspace-write",
          ...(request.prompt ? [request.prompt] : []),
        ],
        ...(request.cwd !== undefined ? { cwd: request.cwd } : {}),
      };
    }

    if (request.presentationMode === "embedded-pane") {
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
        ],
        ...(request.cwd !== undefined ? { cwd: request.cwd } : {}),
        input: request.prompt,
      };
    }

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
