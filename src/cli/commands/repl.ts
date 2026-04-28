import { randomInt } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { emitKeypressEvents } from "node:readline";
import { spawn } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { formatError, formatSuccess } from "../format.js";
import { getCliUsage, toNormalizedRequest } from "../parse.js";
import { createTerminalStyle, formatTerminalHelp } from "../terminal-style.js";
import { AdapterValues, type CliArgs } from "../types.js";
import { ProjectDetector } from "../ProjectDetector.js";
import { SessionStateManager } from "../../core/state/SessionStateManager.js";
import { ReplRegistry, type ReplSession } from "../repl/ReplRegistry.js";
import { runCommand } from "./run.js";

const EXIT_COMMANDS = new Set(["exit", "quit", ".exit", "/exit", "/quit"]);
const HELP_COMMANDS = new Set(["/help"]);
const SESSION_ID_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const LOGIN_MENU_OPTIONS = ["codex", "gemini"] as const;
const VERBOSE_MENU_OPTIONS = ["on", "off"] as const;
const RESUME_SESSION_MENU_OPTIONS = ["continue", "new"] as const;
const terminal = createTerminalStyle({ isTTY: Boolean(output.isTTY), env: process.env });

export type ReplBuiltinCommand =
  | { kind: "help" }
  | { kind: "exit" }
  | { kind: "login" }
  | { kind: "session" }
  | { kind: "adapter"; adapter?: CliArgs["adapter"] }
  | { kind: "model"; model?: string }
  | { kind: "verbose"; value?: boolean };

export interface ReplRuntimeState {
  adapter: CliArgs["adapter"];
  model?: string;
  executionMode: CliArgs["executionMode"];
  verbose: boolean;
}

export const getReplBuiltinCommand = (line: string): ReplBuiltinCommand | null => {
  if (HELP_COMMANDS.has(line)) {
    return { kind: "help" };
  }

  if (line === "/login") {
    return { kind: "login" };
  }

  if (EXIT_COMMANDS.has(line)) {
    return { kind: "exit" };
  }

  if (line === "/session") {
    return { kind: "session" };
  }

  if (line === "/adapter") {
    return { kind: "adapter" };
  }

  if (line.startsWith("/adapter ")) {
    const adapter = line.slice("/adapter ".length).trim();
    if (AdapterValues.includes(adapter as CliArgs["adapter"])) {
      return { kind: "adapter", adapter: adapter as CliArgs["adapter"] };
    }
    return { kind: "adapter" };
  }

  if (line === "/model") {
    return { kind: "model" };
  }

  if (line.startsWith("/model ")) {
    const model = line.slice("/model ".length).trim();
    return model ? { kind: "model", model } : { kind: "model" };
  }

  if (line === "/verbose") {
    return { kind: "verbose" };
  }

  if (line === "/verbose on") {
    return { kind: "verbose", value: true };
  }

  if (line === "/verbose off") {
    return { kind: "verbose", value: false };
  }

  if (line.startsWith("/verbose ")) {
    return { kind: "verbose" };
  }

  return null;
};

export const getNextSelectionIndex = (
  currentIndex: number,
  direction: "up" | "down",
  optionCount: number,
): number => {
  if (optionCount <= 0) {
    return 0;
  }

  if (direction === "up") {
    return currentIndex <= 0 ? optionCount - 1 : currentIndex - 1;
  }

  return currentIndex >= optionCount - 1 ? 0 : currentIndex + 1;
};

export const getNextLoginSelectionIndex = (
  currentIndex: number,
  direction: "up" | "down",
  optionCount = LOGIN_MENU_OPTIONS.length,
): number => getNextSelectionIndex(currentIndex, direction, optionCount);

async function promptForArrowSelection<const T extends string>(
  title: string,
  options: readonly T[],
  initialIndex = 0,
): Promise<T | null> {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== "function") {
    output.write(`${terminal.warning(`! ${title} selection UI requires an interactive TTY.`)}\n`);
    return null;
  }

  emitKeypressEvents(input);

  const lines = [
    title,
    ...options.map((option, index) => `${index === initialIndex ? "❯" : " "} ${option}`),
    "Use ↑/↓ and Enter. Press Esc to cancel.",
  ];
  let selectedIndex = initialIndex;

  const render = (): void => {
    output.write(`\x1b[${lines.length}A`);
    output.write("\r");
    output.write("\x1b[J");
    output.write(`${terminal.title(title)}\n`);
    options.forEach((option, index) => {
      const row = `${index === selectedIndex ? "❯" : " "} ${option}`;
      output.write(`${index === selectedIndex ? terminal.selected(row) : row}\n`);
    });
    output.write(`${terminal.muted("Use ↑/↓ and Enter. Press Esc to cancel.")}\n`);
  };

  output.write("\n");
  output.write(`${terminal.title(title)}\n`);
  options.forEach((option, index) => {
    const row = `${index === initialIndex ? "❯" : " "} ${option}`;
    output.write(`${index === initialIndex ? terminal.selected(row) : row}\n`);
  });
  output.write(`${terminal.muted("Use ↑/↓ and Enter. Press Esc to cancel.")}\n`);
  input.setRawMode(true);

  return await new Promise<T | null>((resolve) => {
    const onKeypress = (_: string, key: { name?: string; sequence?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        resolve(null);
        return;
      }

      if (key.name === "up") {
        selectedIndex = getNextSelectionIndex(selectedIndex, "up", options.length);
        render();
        return;
      }

      if (key.name === "down") {
        selectedIndex = getNextSelectionIndex(selectedIndex, "down", options.length);
        render();
        return;
      }

      if (key.name === "return" || key.name === "enter") {
        const selected = options[selectedIndex] ?? null;
        cleanup();
        resolve(selected);
        return;
      }

      if (key.name === "escape") {
        cleanup();
        resolve(null);
      }
    };

    const cleanup = () => {
      input.off("keypress", onKeypress);
      input.setRawMode(false);
      output.write(`\x1b[${lines.length}A`);
      output.write("\r");
      output.write("\x1b[J");
    };

    input.on("keypress", onKeypress);
  });
}

async function promptForLoginAdapterSelection(
  currentAdapter: CliArgs["adapter"] = LOGIN_MENU_OPTIONS[0],
): Promise<CliArgs["adapter"] | null> {
  return await promptForArrowSelection(
    "Select adapter to log in:",
    LOGIN_MENU_OPTIONS,
    Math.max(0, LOGIN_MENU_OPTIONS.indexOf(currentAdapter)),
  );
}

async function promptForReplAdapterSelection(
  currentAdapter: CliArgs["adapter"],
): Promise<CliArgs["adapter"] | null> {
  return await promptForArrowSelection(
    "Select REPL adapter:",
    LOGIN_MENU_OPTIONS,
    Math.max(0, LOGIN_MENU_OPTIONS.indexOf(currentAdapter)),
  );
}

async function promptForVerboseSelection(currentVerbose: boolean): Promise<boolean | null> {
  const selected = await promptForArrowSelection(
    "Select REPL verbose output:",
    VERBOSE_MENU_OPTIONS,
    currentVerbose ? 0 : 1,
  );
  if (selected === null) {
    return null;
  }

  return selected === "on";
}

async function promptForResumeSessionSelection(lastSession: ReplSession): Promise<boolean> {
  output.write(
    `${terminal.title("Found existing session:")} ${terminal.emphasis(lastSession.session_id)} ${terminal.muted(`(last used ${lastSession.last_resumed_at})`)}\n`,
  );

  const selected = await promptForArrowSelection(
    "Select REPL session mode:",
    RESUME_SESSION_MENU_OPTIONS,
    1,
  );

  if (selected === "continue") {
    output.write(`${terminal.success(`✓ Resuming session: ${lastSession.session_id}`)}\n`);
    return true;
  }

  output.write(`${terminal.warning("! Starting a new session.")}\n`);
  return false;
}

export const getLoginCommandSpec = (
  adapter: CliArgs["adapter"],
): { command: string; args: string[] } => {
  if (adapter === "codex") {
    return { command: "codex", args: ["login"] };
  }

  return { command: "gemini", args: [] };
};

async function runAdapterLoginFlow(adapter: CliArgs["adapter"], cwd: string): Promise<number> {
  const { command, args } = getLoginCommandSpec(adapter);

  return await new Promise<number>((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: false,
    });

    child.on("error", () => resolve(127));
    child.on("close", (code, signal) => {
      resolve(typeof code === "number" ? code : signal ? 128 : 1);
    });
  });
}

export const runReplBuiltinCommand = (
  command: ReplBuiltinCommand,
  state: ReplRuntimeState,
  sessionId: string,
): { shouldExit: boolean; output: string; nextState: ReplRuntimeState } => {
  if (command.kind === "help") {
    return {
      shouldExit: false,
      output:
        `${formatTerminalHelp(getCliUsage("repl"), {
          isTTY: Boolean(output.isTTY),
          env: process.env,
        })}\n`,
      nextState: state,
    };
  }

  if (command.kind === "exit") {
    return {
      shouldExit: true,
      output: "",
      nextState: state,
    };
  }

  if (command.kind === "login") {
    return {
      shouldExit: false,
      output: "",
      nextState: state,
    };
  }

  if (command.kind === "session") {
    return {
      shouldExit: false,
      output:
        JSON.stringify(
          {
            ok: true,
            mode: "repl",
            sessionId,
            adapter: state.adapter,
            ...(state.model !== undefined ? { model: state.model } : {}),
            executionMode: state.executionMode,
            verbose: state.verbose,
          },
          null,
          2,
        ) + "\n",
      nextState: state,
    };
  }

  if (command.kind === "adapter") {
    if (command.adapter === undefined) {
      return {
        shouldExit: false,
        output:
          JSON.stringify(
            {
              ok: true,
              mode: "repl",
              adapter: state.adapter,
              message: "Use /adapter codex or /adapter gemini to change the REPL adapter.",
            },
            null,
            2,
          ) + "\n",
        nextState: state,
      };
    }

    const nextState = {
      ...state,
      adapter: command.adapter,
    };
    return {
      shouldExit: false,
      output:
        JSON.stringify(
          {
            ok: true,
            mode: "repl",
            adapter: nextState.adapter,
            message: `REPL adapter set to ${nextState.adapter}.`,
          },
          null,
          2,
        ) + "\n",
      nextState,
    };
  }

  if (command.kind === "model") {
    if (command.model === undefined) {
      return {
        shouldExit: false,
        output:
          JSON.stringify(
            {
              ok: true,
              mode: "repl",
              ...(state.model !== undefined ? { model: state.model } : {}),
              message: "Use /model <name> to change the adapter model for later prompts.",
            },
            null,
            2,
          ) + "\n",
        nextState: state,
      };
    }

    const nextState = {
      ...state,
      model: command.model,
    };
    return {
      shouldExit: false,
      output:
        JSON.stringify(
          {
            ok: true,
            mode: "repl",
            model: nextState.model,
            message: `REPL model set to ${nextState.model}.`,
          },
          null,
          2,
        ) + "\n",
      nextState,
    };
  }

  if (command.value === undefined) {
    return {
      shouldExit: false,
      output:
        JSON.stringify(
          {
            ok: true,
            mode: "repl",
            verbose: state.verbose,
            message: "Use /verbose on or /verbose off to change verbose output.",
          },
          null,
          2,
        ) + "\n",
      nextState: state,
    };
  }

  const nextState = {
    ...state,
    verbose: command.value,
  };
  return {
    shouldExit: false,
    output:
      JSON.stringify(
        {
          ok: true,
          mode: "repl",
          verbose: nextState.verbose,
          message: `REPL verbose set to ${String(nextState.verbose)}.`,
        },
        null,
        2,
      ) + "\n",
    nextState,
  };
};

async function allocateReplSessionId(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const sessionId = `repl-${Array.from({ length: 16 }, () => SESSION_ID_CHARSET[randomInt(SESSION_ID_CHARSET.length)]!).join("")}`;
    if (!(await SessionStateManager.sessionExists(sessionId))) {
      return sessionId;
    }
  }
  throw new Error("Unable to allocate a unique REPL session id after 10 attempts");
}

interface ResolveReplSessionIdOptions {
  explicitSessionId: string | undefined;
  lastSession: ReplSession | null;
  canPromptForResume: boolean;
  hasStoredSession: (sessionId: string) => Promise<boolean>;
  allocateSessionId: () => Promise<string>;
  promptToResume?: (lastSession: ReplSession) => Promise<boolean>;
  updateLastResumed: () => Promise<void>;
}

export const resolveReplSessionId = async ({
  explicitSessionId,
  lastSession,
  canPromptForResume,
  hasStoredSession,
  allocateSessionId,
  promptToResume,
  updateLastResumed,
}: ResolveReplSessionIdOptions): Promise<string> => {
  if (explicitSessionId) {
    return explicitSessionId;
  }

  if (!lastSession || !(await hasStoredSession(lastSession.session_id))) {
    return allocateSessionId();
  }

  const shouldResume = canPromptForResume
    ? await (promptToResume?.(lastSession) ?? Promise.resolve(false))
    : true;

  if (shouldResume) {
    await updateLastResumed();
    return lastSession.session_id;
  }

  return allocateSessionId();
};

export const runReplCommand = async (baseArgs: CliArgs): Promise<void> => {
  const cwd = process.cwd();
  const project = await ProjectDetector.detect(cwd);
  const lastSession = await ReplRegistry.loadLastSession(project.projectId, cwd);
  const rl = createInterface({ input, output });
  const sessionId = await resolveReplSessionId({
    explicitSessionId: baseArgs.sessionId,
    lastSession,
    canPromptForResume: Boolean(input.isTTY && output.isTTY),
    hasStoredSession: (existingSessionId) => SessionStateManager.sessionExists(existingSessionId),
    allocateSessionId: allocateReplSessionId,
    promptToResume: promptForResumeSessionSelection,
    updateLastResumed: () => ReplRegistry.updateLastResumed(cwd),
  });

  output.write(
    `${terminal.title("detoks repl started")} (adapter=${terminal.emphasis(baseArgs.adapter)}, executionMode=${terminal.emphasis(baseArgs.executionMode)}, verbose=${terminal.emphasis(String(baseArgs.verbose))}, session=${terminal.emphasis(sessionId)}). ${terminal.muted('stub = simulated output; real = adapter\'s real execution path.')} ${terminal.muted('type "/help" for REPL help and "exit" to quit.')}\n`,
  );
  let replState: ReplRuntimeState = {
    adapter: baseArgs.adapter,
    ...(baseArgs.model !== undefined ? { model: baseArgs.model } : {}),
    executionMode: baseArgs.executionMode,
    verbose: baseArgs.verbose,
  };

  const isTTY = Boolean(input.isTTY && output.isTTY);

  try {
    while (true) {
      let line: string;
      try {
        if (!isTTY) {
          output.write(terminal.prompt("detoks> "));
        }
        line = (await rl.question(isTTY ? terminal.prompt("detoks> ") : "")).trim();
      } catch (error) {
        if (error instanceof Error && error.message === "readline was closed") {
          break;
        }
        throw error;
      }
      if (!line) {
        continue;
      }
      const builtinCommand = getReplBuiltinCommand(line);
      if (builtinCommand) {
        if (builtinCommand.kind === "login") {
          const selectedAdapter = await promptForLoginAdapterSelection(replState.adapter);
          if (!selectedAdapter) {
            output.write(`${terminal.warning("! Login cancelled.")}\n`);
            continue;
          }

          rl.pause();
          output.write(`${terminal.title(`Starting ${selectedAdapter} login...`)}\n`);
          const exitCode = await runAdapterLoginFlow(selectedAdapter, cwd);
          rl.resume();
          if (exitCode === 0) {
            output.write(`${terminal.success(`✓ ${selectedAdapter} login flow finished.`)}\n`);
          } else {
            output.write(`${terminal.error(`✗ ${selectedAdapter} login flow exited with code ${exitCode}.`)}\n`);
          }
          continue;
        }

        let resolvedBuiltinCommand = builtinCommand;

        if (builtinCommand.kind === "adapter" && builtinCommand.adapter === undefined) {
          const selectedAdapter = await promptForReplAdapterSelection(replState.adapter);
          if (!selectedAdapter) {
            output.write(`${terminal.warning("! Adapter selection cancelled.")}\n`);
            continue;
          }
          resolvedBuiltinCommand = { kind: "adapter", adapter: selectedAdapter };
        }

        if (builtinCommand.kind === "verbose" && builtinCommand.value === undefined) {
          const selectedVerbose = await promptForVerboseSelection(replState.verbose);
          if (selectedVerbose === null) {
            output.write(`${terminal.warning("! Verbose selection cancelled.")}\n`);
            continue;
          }
          resolvedBuiltinCommand = { kind: "verbose", value: selectedVerbose };
        }

        const builtinResult = runReplBuiltinCommand(resolvedBuiltinCommand, replState, sessionId);
        replState = builtinResult.nextState;
        if (builtinResult.output) {
          output.write(builtinResult.output);
        }
        if (builtinResult.shouldExit) {
          break;
        }
        continue;
      }

      try {
        const request = toNormalizedRequest(
          { ...baseArgs, ...replState, mode: "run", prompt: line },
          { mode: "repl", sessionId },
        );
        const result = await runCommand(request);
        output.write(`${formatSuccess(result, replState.verbose)}\n`);

        // 입력 번역 로깅 (P3)
        if (result.compiledPrompt && result.compiledPrompt !== line) {
          await SessionStateManager.logInputTranslation(
            sessionId,
            line,
            result.compiledPrompt,
          );
        }
      } catch (error) {
        output.write(`${formatError(error, baseArgs.verbose)}\n`);
      }
    }
  } finally {
    await ReplRegistry.saveSession(
      project.projectId,
      sessionId,
      replState.adapter,
      replState.executionMode,
      cwd,
    );
    rl.close();
    // 현재 세션 로그 정리 (P3)
    await SessionStateManager.clearCurrentSessionLog();
    output.write(`${terminal.muted("detoks repl closed.")}\n`);
  }
};
