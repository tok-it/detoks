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
const SESSION_FLAG_HELP =
  "  --session <id>                Resume or use a specific session id";
const MODEL_FLAG_HELP =
  "  --model <name>                Pass a model name through to the selected adapter CLI";
const CLI_USAGE_MAIN = [
  "DeToks CLI Guide",
  "",
  "Quick start:",
  '  detoks "summarize the current repo status"',
  "  detoks repl",
  "  detoks session list",
  "",
  "Usage:",
  '  detoks "<prompt>" [--adapter codex|gemini] [--model <name>] [--execution-mode stub|real] [--session <id>] [--verbose] [--trace]',
  "  detoks --file <path> [--verbose]",
  "  detoks repl [--adapter codex|gemini] [--model <name>] [--execution-mode stub|real] [--session <id>] [--verbose]",
  "",
  "Session / checkpoint commands:",
  "  detoks session list",
  "  detoks session continue <session-id>",
  "  detoks session reset <session-id>",
  "  detoks session fork <source-session-id> <new-session-id>",
  "  detoks checkpoint list <session-id>",
  "  detoks checkpoint show <checkpoint-id>",
  "  detoks checkpoint restore <checkpoint-id>",
  "  detoks repl --help",
  "  detoks --help",
  "",
  "Local LLM env (read from current cwd .env / .env.local):",
  "  LOCAL_LLM_API_BASE, LOCAL_LLM_API_KEY, LOCAL_LLM_MODEL_NAME",
  "",
  "Examples:",
  '  detoks "summarize the current repo status"',
  '  detoks "파이썬으로 버블 정렬 짜줘" --session session_123',
  "  detoks --file tests/data/row_data.json --verbose",
  "  detoks repl --adapter codex --model gpt-5 --execution-mode stub",
  "  detoks session list",
  "  detoks session continue session_2026_04_27",
  "  detoks session reset session_2026_04_27",
  "  detoks session fork session_2026_04_27 session_2026_04_27_fork",
  "  detoks checkpoint list session_2026_04_27",
  "  detoks checkpoint show session_2026_04_27_checkpoint_001",
  "  detoks checkpoint restore session_2026_04_27_checkpoint_001",
  "",
  "Options:",
  "  --adapter codex|gemini        Target adapter (default: codex)",
  MODEL_FLAG_HELP,
  "  --execution-mode stub|real    Runtime execution mode (default: stub)",
  "  --file <path>                 Run batch prompt compilation from a JSON file",
  SESSION_FLAG_HELP,
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
  "  - stdout is JSON with mutatesState=false, hasSessions, sessionCount, message, and sessions",
  "  - each session includes id, updatedAt, currentTaskId, completedTaskCount, taskResultCount, and nextAction",
  "",
  "Options:",
  "  -h, --help                    Show this help message",
].join("\n");

const CLI_USAGE_SESSION_CONTINUE = [
  "Usage:",
  "  detoks session continue <session-id>",
  "",
  "Example:",
  "  detoks session continue session_2026_04_27",
  "",
  "Session continue notes:",
  "  - resumes execution for a saved session by replaying its stored raw_input",
  "  - skips already completed task ids in the session and retries pending/failed work",
  "  - if the session is missing or has no stored raw_input, stdout explains why no resume was started",
  "  - stdout is JSON with sessionId, canContinue, resumeStarted, mutatesState, message, summary, nextAction, and taskRecords",
  "",
  "Options:",
  "  -h, --help                    Show this help message",
].join("\n");

const CLI_USAGE_SESSION_RESET = [
  "Usage:",
  "  detoks session reset <session-id>",
  "",
  "Example:",
  "  detoks session reset session_2026_04_27",
  "",
  "Session reset notes:",
  "  - deletes the session state and all its task results",
  "  - dangerous; cannot be undone",
  "  - stdout is JSON with sessionId, reset=true, mutatesState=true, and message on success",
  "  - missing sessions return ok=false, mutatesState=false, and exit code 1",
  "",
  "Options:",
  "  -h, --help                    Show this help message",
].join("\n");


const CLI_USAGE_SESSION_FORK = [
  "Usage:",
  "  detoks session fork <source-session-id> <new-session-id>",
  "",
  "Example:",
  "  detoks session fork session_2026_04_27 session_2026_04_27_fork",
  "",
  "Session fork notes:",
  "  - copies an existing saved session to a new session id",
  "  - verifies the source session exists and prevents overwriting an existing new session id",
  "  - does not start resume execution or mutate task results",
  "  - stdout is JSON with sourceSessionId, newSessionId, forked, mutatesState, message, and nextAction",
  "  - missing source sessions or duplicate target ids return ok=false, mutatesState=false, and exit code 1",
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
  "  - stdout is JSON with sessionId, mutatesState=false, hasCheckpoints, checkpointCount, message, and checkpoints",
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
  "  - stdout is JSON with mutatesState=false, message, and checkpoint metadata including changedFiles and nextAction",
  "",
  "Options:",
  "  -h, --help                    Show this help message",
].join("\n");

const CLI_USAGE_CHECKPOINT_RESTORE = [
  "Usage:",
  "  detoks checkpoint restore <checkpoint-id>",
  "",
  "Example:",
  "  detoks checkpoint restore session_2026_04_27_checkpoint_001",
  "",
  "Checkpoint restore notes:",
  "  - restores a session to the state captured at this checkpoint",
  "  - subsequent task results after this checkpoint will be truncated",
  "  - stdout is JSON with sessionId, checkpointId, restored=true, mutatesState=true, and message on success",
  "  - invalid restore targets return ok=false, mutatesState=false, and exit code 1",
  "",
  "Options:",
  "  -h, --help                    Show this help message",
].join("\n");

const CLI_USAGE_REPL = [
  "Usage:",
  "  detoks repl [--adapter codex|gemini] [--model <name>] [--execution-mode stub|real] [--session <id>] [--verbose]",
  "  detoks repl --help",
  "",
  "Example:",
  "  detoks repl --adapter codex --model gpt-5 --execution-mode stub",
  "",
  "REPL notes:",
  "  - type a prompt and press Enter to run it",
  "  - the prompt shows the current source as detoks[<adapter>[:<model>]]",
  "  - if a saved project REPL session exists, startup uses an arrow-key chooser to continue it or start fresh",
  "  - type /help to show REPL help inside the REPL",
  "  - type /login to open an arrow-key adapter chooser and start a login flow",
  "  - type /session to inspect the current REPL session and runtime settings",
  "  - type /adapter to open an arrow-key adapter chooser for later prompts",
  "  - type /adapter codex|gemini to change the adapter for later prompts directly",
  "  - type /model or /model <name> to inspect or change the adapter model for later prompts",
  "  - type /verbose to open an arrow-key verbose chooser inside the REPL",
  "  - type /verbose on|off to change concise vs full output inside the REPL directly",
  "  - type exit, quit, .exit, /exit, or /quit to leave the REPL",
  "  - each prompt is executed as a separate work unit",
  "  - execution-mode controls whether prompts use simulated or real execution",
  "",
  "Options:",
  "  --adapter codex|gemini        Target adapter (default: codex)",
  MODEL_FLAG_HELP,
  "  --execution-mode stub|real    Runtime execution mode (default: stub)",
  SESSION_FLAG_HELP,
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
  if (argv.length === 0) {
    return {
      mode: "run",
      adapter: DEFAULT_ADAPTER,
      executionMode: DEFAULT_EXECUTION_MODE,
      verbose: false,
      trace: false,
      showHelp: true,
      helpTopic: "main",
    };
  }

  const positionals: string[] = [];
  let adapter: CliArgs["adapter"] = DEFAULT_ADAPTER;
  let executionMode: CliArgs["executionMode"] = DEFAULT_EXECUTION_MODE;
  let sessionId: string | undefined;
  let inputFile: string | undefined;
  let model: string | undefined;
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
            : positionals[0] === "session" && positionals[1] === "continue"
              ? "session-continue"
            : positionals[0] === "session" && positionals[1] === "reset"
              ? "session-reset"
            : positionals[0] === "session" && positionals[1] === "fork"
              ? "session-fork"
            : positionals[0] === "checkpoint" && positionals[1] === "list"
            ? "checkpoint-list"
            : positionals[0] === "checkpoint" && positionals[1] === "show"
              ? "checkpoint-show"
            : positionals[0] === "checkpoint" && positionals[1] === "restore"
              ? "checkpoint-restore"
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

    if (current === "--model") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("--model requires a value. Run `detoks --help` for usage.");
      }
      model = next;
      i += 1;
      continue;
    }

    if (current.startsWith("--model=")) {
      const inline = current.split("=")[1] ?? "";
      if (!inline) {
        throw new Error("--model requires a value. Run `detoks --help` for usage.");
      }
      model = inline;
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

    if (current === "--session" || current === "--session-id") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error(
          `${current} requires a value. Run \`detoks --help\` for usage.`,
        );
      }
      sessionId = next;
      i += 1;
      continue;
    }

    if (current.startsWith("--session=")) {
      sessionId = current.split("=")[1] ?? "";
      if (!sessionId) {
        throw new Error("--session requires a value. Run `detoks --help` for usage.");
      }
      continue;
    }

    if (current.startsWith("--session-id=")) {
      sessionId = current.split("=")[1] ?? "";
      if (!sessionId) {
        throw new Error("--session-id requires a value. Run `detoks --help` for usage.");
      }
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

    if (positionals[1] === "continue") {
      const sessionIdFromPos = positionals[2]?.trim();
      if (!sessionIdFromPos || positionals.length > 3) {
        throw new Error("Session continue requires exactly one <session-id>. Run `detoks session continue --help` for usage.");
      }
      return {
        mode: "run",
        command: "session-continue",
        sessionId: sessionIdFromPos,
        adapter,
        executionMode,
        verbose,
        trace,
        showHelp: false,
        helpTopic: "session-continue",
      };
    }

    if (positionals[1] === "reset") {
      const sessionIdToReset = positionals[2]?.trim();
      if (!sessionIdToReset || positionals.length > 3) {
        throw new Error("Session reset requires exactly one <session-id>. Run `detoks session reset --help` for usage.");
      }
      return {
        mode: "run",
        command: "session-reset",
        sessionId: sessionIdToReset,
        adapter,
        executionMode,
        verbose,
        trace,
        showHelp: false,
        helpTopic: "session-reset",
      };
    }

    if (positionals[1] === "fork") {
      const sourceSessionId = positionals[2]?.trim();
      const newSessionId = positionals[3]?.trim();
      if (!sourceSessionId || !newSessionId || positionals.length > 4) {
        throw new Error("Session fork requires exactly one <source-session-id> and one <new-session-id>. Run `detoks session fork --help` for usage.");
      }
      return {
        mode: "run",
        command: "session-fork",
        sessionId: sourceSessionId,
        newSessionId,
        adapter,
        executionMode,
        verbose,
        trace,
        showHelp: false,
        helpTopic: "session-fork",
      };
    }

    throw new Error("Unsupported session command. Run `detoks session list --help`, `detoks session continue --help`, or `detoks session fork --help` for usage.");
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

    if (positionals[1] === "restore") {
      const checkpointId = positionals[2]?.trim();
      if (!checkpointId || positionals.length > 3) {
        throw new Error("Checkpoint restore requires exactly one <checkpoint-id>. Run `detoks checkpoint restore --help` for usage.");
      }
      return {
        mode: "run",
        command: "checkpoint-restore",
        checkpointId,
        adapter,
        executionMode,
        verbose,
        trace,
        showHelp: false,
        helpTopic: "checkpoint-restore",
      };
    }

    throw new Error("Unsupported checkpoint command. Run `detoks checkpoint list --help`, `detoks checkpoint show --help`, or `detoks checkpoint restore --help` for usage.");
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
    return {
      mode: "repl",
      adapter,
      ...(model !== undefined ? { model } : {}),
      executionMode,
      verbose,
      trace,
      showHelp: false,
      helpTopic: "repl",
    };
  }

  if (inputFile) {
    if (positionals.length > 0) {
      throw new Error("Prompt input and --file cannot be used together. Run `detoks --help` for usage.");
    }
    return {
      mode: "run",
      inputFile,
      adapter,
      ...(model !== undefined ? { model } : {}),
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
    ...(sessionId !== undefined ? { sessionId } : {}),
    adapter,
    ...(model !== undefined ? { model } : {}),
    executionMode,
    verbose,
    trace,
    showHelp: false,
    helpTopic: "main",
  };
};

export const getCliUsage = (
  topic:
    | "main"
    | "repl"
    | "session-list"
    | "session-continue"
    | "session-reset"
    | "session-fork"
    | "checkpoint-list"
    | "checkpoint-show"
    | "checkpoint-restore" = "main",
): string => {
  if (topic === "repl") {
    return CLI_USAGE_REPL;
  }
  if (topic === "session-list") {
    return CLI_USAGE_SESSION_LIST;
  }
  if (topic === "session-continue") {
    return CLI_USAGE_SESSION_CONTINUE;
  }
  if (topic === "session-reset") {
    return CLI_USAGE_SESSION_RESET;
  }
  if (topic === "session-fork") {
    return CLI_USAGE_SESSION_FORK;
  }
  if (topic === "checkpoint-list") {
    return CLI_USAGE_CHECKPOINT_LIST;
  }
  if (topic === "checkpoint-show") {
    return CLI_USAGE_CHECKPOINT_SHOW;
  }
  if (topic === "checkpoint-restore") {
    return CLI_USAGE_CHECKPOINT_RESTORE;
  }
  return CLI_USAGE_MAIN;
};

export const toNormalizedRequest = (
  args: CliArgs,
  options?: { cwd?: string; sessionId?: string; mode?: CliMode; prompt?: string },
): NormalizedCliRequest => {
  const mode = options?.mode ?? args.mode;
  const promptSource = options?.prompt ?? args.prompt;
  const prompt = mode === "repl" ? promptSource ?? "" : assertPrompt(promptSource);
  const sessionId = options?.sessionId ?? args.sessionId;

  return {
    mode,
    adapter: args.adapter,
    ...(args.model !== undefined ? { model: args.model } : {}),
    executionMode: args.executionMode,
    verbose: args.verbose,
    trace: args.trace,
    userRequest: UserRequestSchema.parse({
      raw_input: prompt,
      cwd: options?.cwd ?? process.cwd(),
      session_id: sessionId,
      timestamp: new Date().toISOString(),
    }),
  };
};
