import type { AdapterExecutionRequest, AdapterExecutionResult } from "../../../core/executor/types.js";
import type { AdapterExecutionContext, CliAdapter } from "../interface.js";
import { executeAdapterViaSubprocess } from "../real.js";
import { buildStubRawOutput } from "../stub.js";
import { buildWorkspaceIsolationEnv } from "../workspace-env.js";

const CLAUDE_PERMISSION_MODE = "default" as const;
const getClaudeSettingSources = (): string =>
  process.env.DETOKS_CLAUDE_SETTING_SOURCES?.trim() || "project";

export class ClaudeStubAdapter implements CliAdapter {
  readonly target = "claude" as const;

  buildSubprocessRequest(request: AdapterExecutionRequest) {
    const workspaceEnv = buildWorkspaceIsolationEnv(request.cwd);
    if (request.presentationMode === "passthrough") {
      // passthrough 모드는 prompt를 CLI 인자로 전달하므로 OS ARG_MAX 제한을 받는다.
      const promptBytes = Buffer.byteLength(request.prompt ?? "", "utf8");
      if (promptBytes > 200_000) {
        throw new Error(
          `passthrough 모드에서 prompt가 너무 큽니다 (${promptBytes} bytes). ` +
          `200,000 bytes 이하로 줄이거나 embedded-pane 모드를 사용하세요.`,
        );
      }
      return {
        command: "claude",
        args: [
          "-p",
          "--output-format",
          "text",
          "--setting-sources",
          getClaudeSettingSources(),
          ...(request.model ? ["--model", request.model] : []),
          "--permission-mode",
          CLAUDE_PERMISSION_MODE,
          ...(request.prompt !== undefined ? [request.prompt] : []),
        ],
        ...(request.cwd !== undefined ? { cwd: request.cwd } : {}),
        ...(workspaceEnv !== undefined ? { env: workspaceEnv } : {}),
      };
    }

    if (request.presentationMode === "embedded-pane") {
      return {
        command: "claude",
        args: [
          "-p",
          "--output-format",
          "text",
          "--setting-sources",
          getClaudeSettingSources(),
          "--permission-mode",
          CLAUDE_PERMISSION_MODE,
          ...(request.model ? ["--model", request.model] : []),
          ...(request.prompt !== undefined ? [request.prompt] : []),
        ],
        ...(request.cwd !== undefined ? { cwd: request.cwd } : {}),
        ...(workspaceEnv !== undefined ? { env: workspaceEnv } : {}),
      };
    }

    return {
      command: "claude",
      args: [
        "-p",
        "--output-format",
        "text",
        "--setting-sources",
        getClaudeSettingSources(),
        "--permission-mode",
        CLAUDE_PERMISSION_MODE,
        ...(request.model ? ["--model", request.model] : []),
        ...(request.prompt !== undefined ? [request.prompt] : []),
      ],
      ...(request.cwd !== undefined ? { cwd: request.cwd } : {}),
      ...(workspaceEnv !== undefined ? { env: workspaceEnv } : {}),
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
