import { UserRequestSchema } from "../schemas/pipeline.js";
import {
  AdapterValues,
  ExecutionModeValues,
  type CliArgs,
  type CliMode,
  type NormalizedCliRequest,
} from "./types.js";

const DEFAULT_ADAPTER = "codex";
const DEFAULT_EXECUTION_MODE = "stub";
const EXECUTION_MODE_HELP = [
  "Execution mode:",
  "    stub = simulated output for fast, safe CLI testing",
  "    real = runs the adapter's real execution path",
].join("\n");
const VERBOSE_HELP =
  "  --verbose                     Show full success JSON and error stacks (output only)";
const TRACE_HELP =
  "  --trace                       Record pipeline stage I/O and save to local_config/trace/{sessionId}-trace.json";
const CLI_USAGE_MAIN = [
  "Usage:",
  '  detoks "<prompt>" [--adapter codex|gemini] [--execution-mode stub|real] [--verbose] [--trace]',
  "  detoks --file <path> [--verbose]",
  "  detoks repl [--adapter codex|gemini] [--execution-mode stub|real] [--verbose]",
  "  detoks session list",
  "  detoks checkpoint list <session-id>",
  "  detoks checkpoint show <checkpoint-id>",
  "  detoks repl --help",
  "  detoks --help",
  "",
  "Examples:",
  '  detoks "summarize the current repo status"',
  '  detoks "파이썬으로 버블 정렬 짜줘" --trace',
  "  detoks --file tests/data/row_data.json --verbose",
  "  detoks repl --adapter codex --execution-mode stub",
  "  detoks session list",
  "  detoks checkpoint list session_2026_04_27",
  "  detoks checkpoint show session_2026_04_27_checkpoint_001",
  "",
  "Options:",
  "  --adapter codex|gemini        Target adapter (default: codex)",
  "  --execution-mode stub|real    Runtime execution mode (default: stub)",
  "  --file <path>                 Run batch prompt compilation from a JSON file",
  EXECUTION_MODE_HELP,
  VERBOSE_HELP,
  TRACE_HELP,
  "  -h, --help                    Show this help message",
].join("\n");

const CLI_USAGE_SESSION_LIST = [
  "Usage:",
  "  detoks session list",
  "",
  "Example:",
  "  detoks session list",
  "",
  "Session notes:",
  "  - lists saved sessions at a high level",
  "  - read-only; does not create, continue, reset, fork, or modify session state",
  "  - stdout JSON contract is intentionally not defined in this step",
  "",
  "Options:",
  "  -h, --help                    Show this help message",
].join("\n");

const CLI_USAGE_CHECKPOINT_LIST = [
  "Usage:",
  "  detoks checkpoint list <session-id>",
  "",
  "Example:",
  "  detoks checkpoint list session_2026_04_27",
  "",
  "Checkpoint notes:",
  "  - lists saved checkpoints for an existing session",
  "  - read-only; does not restore or modify session state",
  "  - stdout is JSON with sessionId, hasCheckpoints, checkpointCount, message, and checkpoints",
  "  - empty sessions return hasCheckpoints=false, checkpointCount=0, and checkpoints=[]",
  "",
  "Options:",
  "  -h, --help                    Show this help message",
].join("\n");


const CLI_USAGE_CHECKPOINT_SHOW = [
  "Usage:",
  "  detoks checkpoint show <checkpoint-id>",
  "",
  "Example:",
  "  detoks checkpoint show session_2026_04_27_checkpoint_001",
  "",
  "Checkpoint notes:",
  "  - shows saved checkpoint metadata by checkpoint id",
  "  - read-only; does not restore or modify session state",
  "  - stdout is JSON with checkpoint id, title, taskId, createdAt, changedFiles, and nextAction",
  "",
  "Options:",
  "  -h, --help                    Show this help message",
].join("\n");

const CLI_USAGE_REPL = [
  "Usage:",
  "  detoks repl [--adapter codex|gemini] [--execution-mode stub|real] [--verbose]",
  "  detoks repl --help",
  "",
  "Example:",
  "  detoks repl --adapter codex --execution-mode stub",
  "",
  "REPL notes:",
  "  - type a prompt and press Enter to run it",
  "  - type exit, quit, or .exit to leave the REPL",
  "  - each prompt is executed as a separate work unit",
  "  - execution-mode controls whether prompts use simulated or real execution",
  "",
  "Options:",
  "  --adapter codex|gemini        Target adapter (default: codex)",
  "  --execution-mode stub|real    Runtime execution mode (default: stub)",
  EXECUTION_MODE_HELP,
  VERBOSE_HELP,
  "  -h, --help                    Show this help message",
].join("\n");

const isAdapter = (value: string): value is (typeof AdapterValues)[number] =>
  AdapterValues.includes(value as (typeof AdapterValues)[number]);

const isExecutionMode = (value: string): value is (typeof ExecutionModeValues)[number] =>
  ExecutionModeValues.includes(value as (typeof ExecutionModeValues)[number]);

const assertPrompt = (prompt: string | undefined): string => {
  const normalized = prompt?.trim();
  if (!normalized) {
    throw new Error(
      "Missing prompt. Run `detoks --help` for usage.",
    );
  }
  return normalized;
};

export const parseCliArgs = (argv: string[]): CliArgs => {
  const positionals: string[] = [];
  let adapter: CliArgs["adapter"] = DEFAULT_ADAPTER;
  let executionMode: CliArgs["executionMode"] = DEFAULT_EXECUTION_MODE;
  let inputFile: string | undefined;
  let verbose = false;
  let trace = false;

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current) {
      continue;
    }

    if (current === "--verbose") {
      verbose = true;
      continue;
    }

    if (current === "--trace") {
      trace = true;
      continue;
    }

    if (current === "-h" || current === "--help") {
      const helpTopic =
        positionals[0] === "repl"
          ? "repl"
          : positionals[0] === "session" && positionals[1] === "list"
            ? "session-list"
            : positionals[0] === "checkpoint" && positionals[1] === "list"
            ? "checkpoint-list"
            : positionals[0] === "checkpoint" && positionals[1] === "show"
              ? "checkpoint-show"
              : "main";
      return {
        mode: "run",
        adapter,
        executionMode,
        verbose,
        trace,
        showHelp: true,
        helpTopic,
      };
    }

    if (current === "--adapter") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("--adapter requires a value: codex|gemini. Run `detoks --help` for usage.");
      }
      if (!isAdapter(next)) {
        throw new Error(`Unsupported adapter: ${next}. Use codex or gemini.`);
      }
      adapter = next;
      i += 1;
      continue;
    }

    if (current.startsWith("--adapter=")) {
      const inline = current.split("=")[1] ?? "";
      if (!isAdapter(inline)) {
        throw new Error(`Unsupported adapter: ${inline}. Use codex or gemini.`);
      }
      adapter = inline;
      continue;
    }

    if (current === "--execution-mode") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error(
          "--execution-mode requires a value: stub|real. Run `detoks --help` for usage.",
        );
      }
      if (!isExecutionMode(next)) {
        throw new Error(`Unsupported execution mode: ${next}. Use stub or real.`);
      }
      executionMode = next;
      i += 1;
      continue;
    }

    if (current.startsWith("--execution-mode=")) {
      const inline = current.split("=")[1] ?? "";
      if (!isExecutionMode(inline)) {
        throw new Error(`Unsupported execution mode: ${inline}. Use stub or real.`);
      }
      executionMode = inline;
      continue;
    }

    if (current === "--file") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("--file requires a path. Run `detoks --help` for usage.");
      }
      inputFile = next;
      i += 1;
      continue;
    }

    if (current.startsWith("--file=")) {
      inputFile = current.split("=")[1] ?? "";
      if (!inputFile) {
        throw new Error("--file requires a path. Run `detoks --help` for usage.");
      }
      continue;
    }

    if (current.startsWith("--")) {
      throw new Error(`Unknown flag: ${current}. Run \`detoks --help\` for usage.`);
    }

    positionals.push(current);
  }

  const first = positionals[0];
  if (first === "session") {
    if (inputFile) {
      throw new Error("Session commands do not support --file. Run `detoks session list --help` for usage.");
    }

    if (positionals[1] === "list") {
      if (positionals.length > 2) {
        throw new Error("Session list does not accept arguments. Run `detoks session list --help` for usage.");
      }
      return {
        mode: "run",
        command: "session-list",
        adapter,
        executionMode,
        verbose,
        trace,
        showHelp: false,
        helpTopic: "session-list",
      };
    }

    throw new Error("Unsupported session command. Run `detoks session list --help` for usage.");
  }

  if (first === "checkpoint") {
    if (inputFile) {
      throw new Error("Checkpoint commands do not support --file. Run `detoks checkpoint --help` for usage.");
    }

    if (positionals[1] === "list") {
      const sessionId = positionals[2]?.trim();
      if (!sessionId || positionals.length > 3) {
        throw new Error("Checkpoint list requires exactly one <session-id>. Run `detoks checkpoint list --help` for usage.");
      }
      return {
        mode: "run",
        command: "checkpoint-list",
        sessionId,
        adapter,
        executionMode,
        verbose,
        trace,
        showHelp: false,
        helpTopic: "checkpoint-list",
      };
    }

    if (positionals[1] === "show") {
      const checkpointId = positionals[2]?.trim();
      if (!checkpointId || positionals.length > 3) {
        throw new Error("Checkpoint show requires exactly one <checkpoint-id>. Run `detoks checkpoint show --help` for usage.");
      }
      return {
        mode: "run",
        command: "checkpoint-show",
        checkpointId,
        adapter,
        executionMode,
        verbose,
        trace,
        showHelp: false,
        helpTopic: "checkpoint-show",
      };
    }

    throw new Error("Unsupported checkpoint command. Run `detoks checkpoint list --help` or `detoks checkpoint show --help` for usage.");
  }

  if (first === "repl") {
    if (inputFile) {
      throw new Error("REPL mode does not support --file. Run `detoks repl --help` for usage.");
    }
    if (positionals.length > 1) {
      throw new Error(
        "REPL mode does not accept prompt arguments. Run `detoks repl --help` for usage.",
      );
    }
    return { mode: "repl", adapter, executionMode, verbose, trace, showHelp: false, helpTopic: "repl" };
  }

  if (inputFile) {
    if (positionals.length > 0) {
      throw new Error("Prompt input and --file cannot be used together. Run `detoks --help` for usage.");
    }
    return {
      mode: "run",
      inputFile,
      adapter,
      executionMode,
      verbose,
      trace,
      showHelp: false,
      helpTopic: "main",
    };
  }

  const prompt = assertPrompt(positionals.join(" "));
  return {
    mode: "run",
    prompt,
    adapter,
    executionMode,
    verbose,
    trace,
    showHelp: false,
    helpTopic: "main",
  };
};

export const getCliUsage = (topic: "main" | "repl" | "session-list" | "checkpoint-list" | "checkpoint-show" = "main"): string => {
  if (topic === "repl") {
    return CLI_USAGE_REPL;
  }
  if (topic === "session-list") {
    return CLI_USAGE_SESSION_LIST;
  }
  if (topic === "checkpoint-list") {
    return CLI_USAGE_CHECKPOINT_LIST;
  }
  if (topic === "checkpoint-show") {
    return CLI_USAGE_CHECKPOINT_SHOW;
  }
  return CLI_USAGE_MAIN;
};

export const toNormalizedRequest = (
  args: CliArgs,
  options?: { cwd?: string; sessionId?: string; mode?: CliMode },
): NormalizedCliRequest => {
  const mode = options?.mode ?? args.mode;
  const prompt = mode === "repl" ? args.prompt ?? "" : assertPrompt(args.prompt);

  return {
    mode,
    adapter: args.adapter,
    executionMode: args.executionMode,
    verbose: args.verbose,
    trace: args.trace,
    userRequest: UserRequestSchema.parse({
      raw_input: prompt,
      cwd: options?.cwd ?? process.cwd(),
      session_id: options?.sessionId,
      timestamp: new Date().toISOString(),
    }),
  };
};
