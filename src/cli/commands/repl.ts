import { randomInt } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { formatError, formatSuccess } from "../format.js";
import { toNormalizedRequest } from "../parse.js";
import type { CliArgs } from "../types.js";
import { runCommand } from "./run.js";

const EXIT_COMMANDS = new Set(["exit", "quit", ".exit"]);

export const runReplCommand = async (baseArgs: CliArgs): Promise<void> => {
  const rl = createInterface({ input, output });
  const SESSION_ID_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const sessionId = `repl-${Array.from({ length: 16 }, () => SESSION_ID_CHARSET[randomInt(SESSION_ID_CHARSET.length)]!).join("")}`;

  output.write(
    `detoks repl started (adapter=${baseArgs.adapter}, executionMode=${baseArgs.executionMode}, verbose=${String(baseArgs.verbose)}). stub = simulated output; real = adapter's real execution path. type "exit" to quit.\n`,
  );

  try {
    while (true) {
      const line = (await rl.question("detoks> ")).trim();
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
    output.write("detoks repl closed.\n");
  }
};
