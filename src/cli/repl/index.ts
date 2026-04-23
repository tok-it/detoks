import type { CliArgs } from "../types.js";
import { runReplCommand } from "../commands/repl.js";

export const startRepl = async (args: CliArgs): Promise<void> => runReplCommand(args);
