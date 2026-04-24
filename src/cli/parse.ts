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
const CLI_USAGE_MAIN = [
  "Usage:",
  '  detoks "<prompt>" [--adapter codex|gemini] [--execution-mode stub|real] [--verbose]',
  "  detoks repl [--adapter codex|gemini] [--execution-mode stub|real] [--verbose]",
  "  detoks repl --help",
  "  detoks --help",
  "",
  "Options:",
  "  --adapter codex|gemini        Target adapter (default: codex)",
  "  --execution-mode stub|real    Runtime execution mode (default: stub)",
  EXECUTION_MODE_HELP,
  "  --verbose                     Show full JSON output and error stacks",
  "  -h, --help                    Show this help message",
].join("\n");

const CLI_USAGE_REPL = [
  "Usage:",
  "  detoks repl [--adapter codex|gemini] [--execution-mode stub|real] [--verbose]",
  "  detoks repl --help",
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
  "  --verbose                     Show full JSON output and error stacks",
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
  let verbose = false;

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current) {
      continue;
    }

    if (current === "--verbose") {
      verbose = true;
      continue;
    }

    if (current === "-h" || current === "--help") {
      const helpTopic = positionals[0] === "repl" ? "repl" : "main";
      return {
        mode: "run",
        adapter,
        executionMode,
        verbose,
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

    if (current.startsWith("--")) {
      throw new Error(`Unknown flag: ${current}. Run \`detoks --help\` for usage.`);
    }

    positionals.push(current);
  }

  const first = positionals[0];
  if (first === "repl") {
    if (positionals.length > 1) {
      throw new Error(
        "REPL mode does not accept prompt arguments. Run `detoks repl --help` for usage.",
      );
    }
    return { mode: "repl", adapter, executionMode, verbose, showHelp: false, helpTopic: "repl" };
  }

  const prompt = assertPrompt(positionals.join(" "));
  return {
    mode: "run",
    prompt,
    adapter,
    executionMode,
    verbose,
    showHelp: false,
    helpTopic: "main",
  };
};

export const getCliUsage = (topic: "main" | "repl" = "main"): string =>
  topic === "repl" ? CLI_USAGE_REPL : CLI_USAGE_MAIN;

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
    userRequest: UserRequestSchema.parse({
      raw_input: prompt,
      cwd: options?.cwd ?? process.cwd(),
      session_id: options?.sessionId,
      timestamp: new Date().toISOString(),
    }),
  };
};
