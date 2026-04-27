#!/usr/bin/env node

import { formatBatchSuccess, formatError, formatFailedResult, formatSuccess } from "./format.js";
import { getCliUsage, parseCliArgs, toNormalizedRequest } from "./parse.js";
import { runCheckpointListCommand } from "./commands/checkpoint-list.js";
import { runCheckpointShowCommand } from "./commands/checkpoint-show.js";
import { runBatchCommand } from "./commands/run-batch.js";
import { runCommand } from "./commands/run.js";
import { runSessionListCommand } from "./commands/session-list.js";
import { runSessionContinueCommand } from "./commands/session-continue.js";
import { startRepl } from "./repl/index.js";

const runOneShotCommand = async (
  request: ReturnType<typeof toNormalizedRequest>,
) => {
  const originalError = console.error;
  const originalWarn = console.warn;

  if (process.env.DETOKS_DEBUG !== "1") {
    console.error = () => undefined;
    console.warn = () => undefined;
  }

  try {
    return await runCommand(request);
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
};

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

  if (args.command === "session-list") {
    const result = await runSessionListCommand();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.command === "session-continue") {
    const result = await runSessionContinueCommand(args.sessionId ?? "");
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.command === "checkpoint-list") {
    const result = await runCheckpointListCommand(args.sessionId ?? "");
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.command === "checkpoint-show") {
    const result = await runCheckpointShowCommand(args.checkpointId ?? "");
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.inputFile) {
    const result = await runBatchCommand(args);
    console.log(formatBatchSuccess(result, args.verbose));
    return;
  }

  const request = toNormalizedRequest(args);
  const result = await runOneShotCommand(request);
  if (!result.ok) {
    console.error(formatFailedResult(result, args.verbose));
    process.exitCode = 1;
    return;
  }

  console.log(formatSuccess(result, args.verbose));
};

main().catch((error) => {
  const verbose = process.argv.includes("--verbose");
  console.error(formatError(error, verbose));
  process.exitCode = 1;
});
