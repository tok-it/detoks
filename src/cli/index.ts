#!/usr/bin/env node

import { formatError, formatSuccess } from "./format.js";
import { getCliUsage, parseCliArgs, toNormalizedRequest } from "./parse.js";
import { runCommand } from "./commands/run.js";
import { startRepl } from "./repl/index.js";

const main = async (): Promise<void> => {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.showHelp) {
    console.log(getCliUsage(args.helpTopic ?? "main"));
    return;
  }

  if (args.mode === "repl") {
    await startRepl(args);
    return;
  }

  const request = toNormalizedRequest(args);
  const result = await runCommand(request);
  console.log(formatSuccess(result, args.verbose));
};

main().catch((error) => {
  const verbose = process.argv.includes("--verbose");
  console.error(formatError(error, verbose));
  process.exitCode = 1;
});
