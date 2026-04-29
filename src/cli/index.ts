#!/usr/bin/env node

import { formatBatchSuccess, formatError, formatFailedResult, formatSessionListHuman, formatSuccess } from "./format.js";
import { getCliUsage, parseCliArgs, toNormalizedRequest } from "./parse.js";
import { runCheckpointListCommand } from "./commands/checkpoint-list.js";
import { runCheckpointShowCommand } from "./commands/checkpoint-show.js";
import { runBatchCommand } from "./commands/run-batch.js";
import { runCommand } from "./commands/run.js";
import { runSessionListCommand } from "./commands/session-list.js";
import { runSessionContinueCommand } from "./commands/session-continue.js";
import { runSessionResetCommand } from "./commands/session-reset.js";
import { runSessionForkCommand } from "./commands/session-fork.js";
import { runCheckpointRestoreCommand } from "./commands/checkpoint-restore.js";
import { startRepl } from "./repl/index.js";
import { colors } from "./colors.js";

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
  const argv = process.argv.slice(2);

  if (argv.length === 0) {
    argv.push("repl");
  }

  const args = parseCliArgs(argv);

  if (args.showHelp) {
    console.log(getCliUsage(args.helpTopic ?? "main"));
    return;
  }

  if (args.mode === "repl") {
    await startRepl(args);
    return;
  }

  if (args.command === "session-list") {
    const result = await runSessionListCommand(
      args.human ? { includeLastWorkSummary: true } : undefined,
    );
    console.log(args.human ? formatSessionListHuman(result) : JSON.stringify(result, null, 2));
    return;
  }

  if (args.command === "session-continue") {
    const request = toNormalizedRequest(args, {
      prompt: "[session continue]",
      ...(args.sessionId ? { sessionId: args.sessionId } : {}),
    });
    const result = await runSessionContinueCommand(request, runOneShotCommand);
    console.log(JSON.stringify(result, null, 2));
    if (result.resumeStarted && !result.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (args.command === "session-reset") {
    const result = await runSessionResetCommand(args.sessionId ?? "");
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (args.command === "session-fork") {
    const result = await runSessionForkCommand(args.sessionId ?? "", args.newSessionId ?? "");
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      process.exitCode = 1;
    }
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

  if (args.command === "checkpoint-restore") {
    const result = await runCheckpointRestoreCommand(args.checkpointId ?? "");
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      process.exitCode = 1;
    }
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
    console.error(`${colors.cross} ${colors.error("실패")}\n${formatFailedResult(result, args.verbose)}`);
    process.exitCode = 1;
    return;
  }

  console.log(`${colors.checkmark} ${colors.success("성공")}\n${formatSuccess(result, args.verbose)}`);
};

main().catch((error) => {
  const verbose = process.argv.includes("--verbose");
  console.error(`${colors.cross} ${colors.error("에러")}\n${formatError(error, verbose)}`);
  process.exitCode = 1;
});
