import { randomInt } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { formatError, formatSuccess } from "../format.js";
import { toNormalizedRequest } from "../parse.js";
import type { CliArgs } from "../types.js";
import { SessionStateManager } from "../../core/state/SessionStateManager.js";
import { runCommand } from "./run.js";

const EXIT_COMMANDS = new Set(["exit", "quit", ".exit"]);
const SESSION_ID_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

async function allocateReplSessionId(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const sessionId = `repl-${Array.from({ length: 16 }, () => SESSION_ID_CHARSET[randomInt(SESSION_ID_CHARSET.length)]!).join("")}`;
    if (!(await SessionStateManager.sessionExists(sessionId))) {
      return sessionId;
    }
  }
  throw new Error("Unable to allocate a unique REPL session id after 10 attempts");
}

export const runReplCommand = async (baseArgs: CliArgs): Promise<void> => {
  const rl = createInterface({ input, output });
  const sessionId = await allocateReplSessionId();

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
