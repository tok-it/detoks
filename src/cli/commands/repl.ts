import { createInterface } from "node:readline/promises";
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
import { loadAndApplyConfig } from "../config/loader.js";
import { updateSelectedAdapter } from "../config/config-manager.js";

const EXIT_COMMANDS = new Set(["exit", "quit", ".exit"]);

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
  // 저장된 설정 로드 및 환경변수 적용 (CLI adapter에 맞는 모델만 로드)
  loadAndApplyConfig(baseArgs.adapter as "codex" | "gemini");

  await runModelSetupIfNeeded();

  const rl = createInterface({ input, output });
  const sessionId = `repl-${Date.now()}`;
  let verbose = baseArgs.verbose;
  let currentAdapter = baseArgs.adapter as "codex" | "gemini";

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
  showHelpMessage(currentAdapter);

  try {
    while (true) {
      let line: string;
      try {
        const promptStr = buildPrompt({
          adapter: currentAdapter,
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
        continue;
      }
      if (EXIT_COMMANDS.has(line)) {
        break;
      }

      // Slash 명령 처리
      if (line.startsWith("/")) {
        const handled = await handleSlashCommand(line, {
          adapter: currentAdapter,
          executionMode: baseArgs.executionMode,
          modelName: process.env.LOCAL_LLM_MODEL_NAME,
          verbose,
          onVerboseToggle: (enabled) => {
            verbose = enabled;
          },
          onAdapterChange: async (newAdapter) => {
            currentAdapter = newAdapter;
            loadAndApplyConfig(newAdapter);
            updateSelectedAdapter(newAdapter);
            showHelpMessage(newAdapter);
          },
          onInteractiveStart: () => {
            rl.pause();
          },
          onInteractiveEnd: () => {
            rl.resume();
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
          { ...baseArgs, mode: "run", prompt: line },
          { mode: "repl", sessionId },
        );
        const result = await runCommand({ ...request, onProgress });
        output.write(`${formatSuccess(result, verbose)}\n`);
      } catch (error) {
        output.write(`${formatError(error, verbose)}\n`);
      }
    }
  } finally {
    rl.close();
    output.write(`\n${colors.info("detoks repl 종료.")}\n`);
  }
};
