import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AdapterExecutionRequest, AdapterExecutionResult } from "../../../core/executor/types.js";
import type { AdapterExecutionContext, CliAdapter } from "../interface.js";
import { getCodexReasoningEffortOverride } from "../../../cli/config/config-manager.js";
import { executeAdapterViaSubprocess } from "../real.js";
import { buildStubRawOutput } from "../stub.js";
import { buildWorkspaceCommandArgs, buildWorkspaceIsolationEnv } from "../workspace-env.js";

const createCodexLastMessagePath = (): string =>
  join(mkdtempSync(join(tmpdir(), "detoks-codex-last-message-")), "last-message.txt");

export class CodexStubAdapter implements CliAdapter {
  readonly target = "codex" as const;

  buildSubprocessRequest(request: AdapterExecutionRequest) {
    const reasoningEffort = getCodexReasoningEffortOverride();
    const workspaceEnv = buildWorkspaceIsolationEnv(request.cwd);
    const workspaceArgs = buildWorkspaceCommandArgs(this.target, request.cwd);

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
          ...workspaceArgs,
          ...(reasoningEffort ? ["-c", `model_reasoning_effort=${reasoningEffort}`] : []),
          ...(request.model ? ["--model", request.model] : []),
          "--sandbox",
          "workspace-write",
          ...(request.prompt ? [request.prompt] : []),
        ],
        ...(request.cwd !== undefined ? { cwd: request.cwd } : {}),
        ...(workspaceEnv !== undefined ? { env: workspaceEnv } : {}),
      };
    }

    if (request.presentationMode === "embedded-pane") {
      const outputLastMessagePath = createCodexLastMessagePath();
      return {
        command: "codex",
        args: [
          "--ask-for-approval",
          "on-request",
          "exec",
          ...workspaceArgs,
          ...(reasoningEffort ? ["-c", `model_reasoning_effort=${reasoningEffort}`] : []),
          ...(request.model ? ["--model", request.model] : []),
          "--json",
          "-",
          "--sandbox",
          "workspace-write",
          "--skip-git-repo-check",
          "--output-last-message",
          outputLastMessagePath,
        ],
        ...(request.cwd !== undefined ? { cwd: request.cwd } : {}),
        ...(workspaceEnv !== undefined ? { env: workspaceEnv } : {}),
        input: request.prompt,
        interactiveAfterInput: true,
        outputLastMessagePath,
      };
    }

    return {
      command: "codex",
      args: [
        "exec",
        ...workspaceArgs,
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
      ...(workspaceEnv !== undefined ? { env: workspaceEnv } : {}),
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
