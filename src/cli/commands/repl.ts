import { randomInt } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { emitKeypressEvents } from "node:readline";
import { spawn } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { formatError, formatSuccess } from "../format.js";
import { toNormalizedRequest } from "../parse.js";
import type { CliArgs } from "../types.js";
import type { PipelineProgressEvent } from "../../core/pipeline/types.js";
import { runCommand } from "./run.js";
import { colors } from "../colors.js";
import { runModelSetupIfNeeded } from "../model-setup/index.js";
import { showHelpMessage, handleSlashCommand } from "../repl-commands/index.js";
import { buildPrompt } from "../interactive/prompt-builder.js";

const EXIT_COMMANDS = new Set(["exit", "quit", ".exit", "/exit", "/quit"]);
const HELP_COMMANDS = new Set(["/help"]);
const SESSION_ID_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const LOGIN_MENU_OPTIONS = ["codex", "gemini"] as const;
const VERBOSE_MENU_OPTIONS = ["on", "off"] as const;
const RESUME_SESSION_MENU_OPTIONS = ["continue", "new"] as const;
const DEFAULT_REPL_ADAPTER: ReplAdapter = "codex";
type ReplAdapter = NonNullable<CliArgs["adapter"]>;
const terminal = createTerminalStyle({ isTTY: Boolean(output.isTTY), env: process.env });

const formatProgressEvent = (event: PipelineProgressEvent): string => {
  const icon =
    event.status === "end"
      ? colors.success("✓")
      : event.status === "error"
        ? colors.error("✗")
        : event.status === "skip"
          ? colors.warning("↷")
          : colors.info("•");

  return `${icon} ${event.message}`;
};

export const runReplCommand = async (baseArgs: CliArgs): Promise<void> => {
  await runModelSetupIfNeeded();

  const rl = createInterface({ input, output });
  const sessionId = `repl-${Date.now()}`;
  let verbose = baseArgs.verbose;

  const startMessage = [
    colors.title("detoks repl 시작"),
    `  adapter=${colors.info(baseArgs.adapter)}`,
    `  executionMode=${colors.info(baseArgs.executionMode)}`,
    `  verbose=${colors.info(String(verbose))}`,
    "",
    `${colors.muted("stub")} = 모의 출력; ${colors.muted("real")} = 어댑터의 실제 실행 경로`,
    colors.info(`명령어 목록을 보려면 ${colors.boldText('"/help"')}를 입력하세요.\n`),
  ].join("\n");

  output.write(startMessage);
  showHelpMessage(baseArgs.adapter as "codex" | "gemini");

  try {
    while (true) {
      let line: string;
      try {
        const promptStr = buildPrompt({
          adapter: baseArgs.adapter as "codex" | "gemini",
          adapterModel: process.env.ADAPTER_MODEL,
          translationModel: process.env.LOCAL_LLM_MODEL_NAME,
        });
        line = (await rl.question(promptStr)).trim();
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message === "readline was closed" ||
            error.message.includes("readline was closed"))
        ) {
          break;
        }

        throw error;
      }
      if (!line) {
        if (inlineSlashMenuVisible) {
          clearInlineSlashMenu();
          inlineSlashMenuVisible = false;
        }
        inlineSlashMenuVisible = false;
        refreshReadlineLine(rl as unknown as { _refreshLine?: () => void });
        continue;
      }
      const builtinCommand = getReplBuiltinCommand(line);
      if (builtinCommand) {
        if (builtinCommand.kind === "login") {
          const selectedAdapter = await promptForLoginAdapterSelection(replState.adapter);
          if (!selectedAdapter) {
            output.write(`${terminal.warning("! 로그인이 취소되었습니다.")}\n`);
            continue;
          }

          rl.pause();
          output.write(`${terminal.title(`${selectedAdapter} 로그인 시작 중...`)}\n`);
          const exitCode = await runAdapterLoginFlow(selectedAdapter, cwd);
          rl.resume();
          if (exitCode === 0) {
            output.write(`${terminal.success(`✓ ${selectedAdapter} 로그인이 완료되었습니다.`)}\n`);
          } else {
            output.write(`${terminal.error(`✗ ${selectedAdapter} 로그인이 종료 코드 ${exitCode}로 종료되었습니다.`)}\n`);
          }
          continue;
        }

        if (builtinCommand.kind === "menu") {
          if (inlineSlashMenuVisible) {
            clearInlineSlashMenu();
            inlineSlashMenuVisible = false;
            refreshReadlineLine(rl as unknown as { _refreshLine?: () => void });
            continue;
          }

          const menuResult = runReplBuiltinCommand(builtinCommand, replState, sessionId);
          if (menuResult.output) {
            rl.pause();
            await new Promise<void>((resolve, reject) => {
              output.write(menuResult.output, (error) => {
                if (error) {
                  reject(error);
                  return;
                }
                resolve();
              });
            });
            rl.resume();
          }
          continue;
        }

        let resolvedBuiltinCommand = builtinCommand;

        if (builtinCommand.kind === "adapter" && builtinCommand.adapter === undefined) {
          const selectedAdapter = await promptForReplAdapterSelection(replState.adapter);
          if (!selectedAdapter) {
            output.write(`${terminal.warning("! 어댑터 선택이 취소되었습니다.")}\n`);
            refreshReadlineLine(rl as unknown as { _refreshLine?: () => void });
            continue;
          }
          resolvedBuiltinCommand = { kind: "adapter", adapter: selectedAdapter };
        }

        if (builtinCommand.kind === "verbose" && builtinCommand.value === undefined) {
          const selectedVerbose = await promptForVerboseSelection(replState.verbose);
          if (selectedVerbose === null) {
            output.write(`${terminal.warning("! 상세 출력 선택이 취소되었습니다.")}\n`);
            refreshReadlineLine(rl as unknown as { _refreshLine?: () => void });
            continue;
          }
          resolvedBuiltinCommand = { kind: "verbose", value: selectedVerbose };
        }

        const builtinResult = runReplBuiltinCommand(resolvedBuiltinCommand, replState, sessionId);
        replState = builtinResult.nextState;
        if (builtinResult.output) {
          output.write(builtinResult.output);
        }
        if (builtinResult.shouldExit) {
          break;
        }
        refreshReadlineLine(rl as unknown as { _refreshLine?: () => void });
        continue;
      }

      // Slash 명령 처리
      if (line.startsWith("/")) {
        const handled = await handleSlashCommand(line, {
          adapter: baseArgs.adapter,
          executionMode: baseArgs.executionMode,
          modelName: process.env.LOCAL_LLM_MODEL_NAME,
          verbose,
          onVerboseToggle: (enabled) => {
            verbose = enabled;
          },
          onExit: async () => {
            rl.close();
          },
        });

        if (handled) {
          continue;
        } else {
          output.write(
            colors.warning(
              `\n알 수 없는 명령어: ${line}\n도움말을 보려면 "/help"를 입력하세요.\n\n`,
            ),
          );
          continue;
        }
      }

      try {
        const onProgress = async (event: PipelineProgressEvent): Promise<void> => {
          output.write(`${formatProgressEvent(event)}\n`);
        };
        const request = toNormalizedRequest(
          requestArgs,
          { mode: "repl", sessionId },
        );
        const result = await runCommand({ ...request, onProgress });
        output.write(`${formatSuccess(result, verbose)}\n`);
      } catch (error) {
        output.write(`${formatError(error, verbose)}\n`);
      }
      inlineSlashMenuVisible = false;
      refreshReadlineLine(rl as unknown as { _refreshLine?: () => void });
    }
  } finally {
    await ReplRegistry.saveSession(
      project.projectId,
      sessionId,
      replState.adapter,
      replState.executionMode,
      cwd,
    );
    rl.close();
    output.write(`\n${colors.info("detoks repl 종료.")}\n`);
  }
};
