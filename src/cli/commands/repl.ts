import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { formatError, formatSuccess } from "../format.js";
import { toNormalizedRequest } from "../parse.js";
import type { CliArgs } from "../types.js";
import { runCommand } from "./run.js";
import { colors } from "../colors.js";

const EXIT_COMMANDS = new Set(["exit", "quit", ".exit"]);

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
      const line = (await rl.question(colors.prompt("detoks> "))).trim();
      if (!line) {
        continue;
      }
      if (EXIT_COMMANDS.has(line)) {
        break;
      }

      try {
        const request = toNormalizedRequest(
          { ...baseArgs, mode: "run", prompt: line },
          { mode: "repl", sessionId },
        );
        const result = await runCommand(request);
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
