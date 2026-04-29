import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { formatError, formatSuccess } from "../format.js";
import { toNormalizedRequest } from "../parse.js";
import type { CliArgs } from "../types.js";
import type { PipelineProgressEvent } from "../../core/pipeline/types.js";
import { runCommand } from "./run.js";
import { colors } from "../colors.js";

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
  const rl = createInterface({ input, output });
  const sessionId = `repl-${Date.now()}`;

  const startMessage = [
    colors.title("detoks repl 시작"),
    `  adapter=${colors.info(baseArgs.adapter)}`,
    `  executionMode=${colors.info(baseArgs.executionMode)}`,
    `  verbose=${colors.info(String(baseArgs.verbose))}`,
    "",
    `${colors.muted("stub")} = 모의 출력; ${colors.muted("real")} = 어댑터의 실제 실행 경로`,
    `종료하려면 ${colors.warning('"exit"')}를 입력하세요.\n`,
  ].join("\n");

  output.write(startMessage);

  try {
    while (true) {
      let line: string;
      try {
        line = (await rl.question(colors.prompt("detoks> "))).trim();
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

      try {
        const onProgress = async (event: PipelineProgressEvent): Promise<void> => {
          output.write(`${formatProgressEvent(event)}\n`);
        };
        const request = toNormalizedRequest(
          { ...baseArgs, mode: "run", prompt: line },
          { mode: "repl", sessionId },
        );
        const result = await runCommand({ ...request, onProgress });
        output.write(`${formatSuccess(result, baseArgs.verbose)}\n`);
      } catch (error) {
        output.write(`${formatError(error, baseArgs.verbose)}\n`);
      }
    }
  } finally {
    rl.close();
    output.write(`\n${colors.info("detoks repl 종료.")}\n`);
  }
};
