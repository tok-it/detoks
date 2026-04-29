import { randomInt } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { emitKeypressEvents } from "node:readline";
import { spawn } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { formatError, formatSuccess } from "../format.js";
import { getCliUsage, toNormalizedRequest } from "../parse.js";
import { createTerminalStyle, formatTerminalHelp } from "../terminal-style.js";
import { startSpinner } from "../terminal-spinner.js";
import { AdapterValues, type CliArgs } from "../types.js";
import { ProjectDetector } from "../ProjectDetector.js";
import { SessionStateManager } from "../../core/state/SessionStateManager.js";
import { ReplRegistry, type ReplSession } from "../repl/ReplRegistry.js";
import { runCommand } from "./run.js";
import { colors } from "../colors.js";

const EXIT_COMMANDS = new Set(["exit", "quit", ".exit", "/exit", "/quit"]);
const HELP_COMMANDS = new Set(["/help"]);
const SESSION_ID_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const LOGIN_MENU_OPTIONS = ["codex", "gemini"] as const;
const VERBOSE_MENU_OPTIONS = ["on", "off"] as const;
const RESUME_SESSION_MENU_OPTIONS = ["continue", "new"] as const;
const DEFAULT_REPL_ADAPTER: ReplAdapter = "codex";
type ReplAdapter = NonNullable<CliArgs["adapter"]>;
const terminal = createTerminalStyle({ isTTY: Boolean(output.isTTY), env: process.env });

export type ReplBuiltinCommand =
  | { kind: "menu" }
  | { kind: "help" }
  | { kind: "exit" }
  | { kind: "login" }
  | { kind: "session" }
  | { kind: "adapter"; adapter?: CliArgs["adapter"] }
  | { kind: "model"; model?: string }
  | { kind: "verbose"; value?: boolean };

export interface ReplRuntimeState {
  adapter: ReplAdapter;
  model?: string;
  executionMode: CliArgs["executionMode"];
  verbose: boolean;
}

export const getReplPromptLabel = (state: ReplRuntimeState): string =>
  `detoks[${[state.adapter, ...(state.model ? [state.model] : [])].join(":")}]> `;

export const getReplSourceBadgeKey = (state: ReplRuntimeState): string =>
  [state.adapter, state.model ?? "", state.executionMode].join("::");

export const shouldEmitReplSourceBadge = (
  state: ReplRuntimeState,
  lastBadgeKey: string | null,
): boolean => getReplSourceBadgeKey(state) !== lastBadgeKey;

export const getReplBuiltinCommand = (line: string): ReplBuiltinCommand | null => {
  if (line === "/") {
    return { kind: "menu" };
  }

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
    if (adapter && AdapterValues.includes(adapter as ReplAdapter)) {
      return { kind: "adapter", adapter: adapter as ReplAdapter };
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
    output.write(`${terminal.warning(`! ${title} 선택 UI는 대화형 TTY가 필요합니다.`)}\n`);
    return null;
  }

  emitKeypressEvents(input);

  const lines = [
    title,
    ...options.map((option, index) => `${index === initialIndex ? "❯" : " "} ${option}`),
    "↑/↓ 키와 Enter를 사용하세요. Esc로 취소합니다.",
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
    output.write(`${terminal.muted("↑/↓ 키와 Enter를 사용하세요. Esc로 취소합니다.")}\n`);
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
  currentAdapter: ReplAdapter = LOGIN_MENU_OPTIONS[0],
): Promise<ReplAdapter | null> {
  return await promptForArrowSelection(
    "로그인할 어댑터를 선택하세요:",
    LOGIN_MENU_OPTIONS,
    Math.max(0, LOGIN_MENU_OPTIONS.indexOf(currentAdapter)),
  );
}

async function promptForReplAdapterSelection(
  currentAdapter: ReplAdapter = DEFAULT_REPL_ADAPTER,
): Promise<ReplAdapter | null> {
  return await promptForArrowSelection(
    "REPL 어댑터를 선택하세요:",
    LOGIN_MENU_OPTIONS,
    Math.max(0, LOGIN_MENU_OPTIONS.indexOf(currentAdapter)),
  );
}

function formatReplCommandMenu(state: ReplRuntimeState): string {
  const commands = [
    ["/help", "REPL 도움말 표시"],
    ["/login", "Codex/Gemini 로그인 흐름 시작"],
    ["/session", "현재 REPL 세션과 런타임 정보 확인"],
    ["/adapter", "어댑터 선택 UI 표시"],
    ["/adapter codex", "이후 프롬프트의 어댑터를 codex로 변경"],
    ["/adapter gemini", "이후 프롬프트의 어댑터를 gemini로 변경"],
    ["/model", "모델 변경 안내 표시"],
    ["/model <이름>", "이후 프롬프트의 모델을 변경"],
    ["/verbose", "상세 출력 선택 UI 표시"],
    ["/verbose on", "상세 출력 켜기"],
    ["/verbose off", "상세 출력 끄기"],
    ["/exit", "REPL 종료"],
    ["/quit", "REPL 종료"],
    [".exit", "REPL 종료"],
  ] as const;

  const lines = [
    terminal.title("REPL 명령어 목록"),
    terminal.muted(`현재 소스: ${getReplPromptLabel(state).trimEnd()}`),
    "",
    ...commands.map(([command, description]) =>
      `${terminal.emphasis(command.padEnd(18))} ${terminal.muted(description)}`,
    ),
    "",
    terminal.muted("명령을 입력하거나 /help를 입력해 자세한 도움말을 볼 수 있습니다."),
  ];

  return `${lines.join("\n")}\n`;
}

function renderReplCommandMenuInline(state: ReplRuntimeState): string {
  return `\n${formatReplCommandMenu(state)}`;
}

function renderInlineSlashMenu(state: ReplRuntimeState): void {
  output.write("\x1b[s");
  output.write(renderReplCommandMenuInline(state));
  output.write("\x1b[u");
}

function clearInlineSlashMenu(): void {
  output.write("\x1b[s");
  output.write("\x1b[J");
  output.write("\x1b[u");
}

function refreshReadlineLine(rl: {
  _refreshLine?: () => void;
}): void {
  rl._refreshLine?.();
}

async function resolveInitialReplAdapter(
  baseAdapter: ReplAdapter | undefined,
  lastSession: ReplSession | null,
): Promise<ReplAdapter> {
  if (baseAdapter !== undefined) {
    return baseAdapter;
  }

  if (lastSession && AdapterValues.includes(lastSession.adapter as ReplAdapter)) {
    return lastSession.adapter as ReplAdapter;
  }

  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== "function") {
    return DEFAULT_REPL_ADAPTER;
  }

  const selected = await promptForReplAdapterSelection(DEFAULT_REPL_ADAPTER);
  if (selected) {
    return selected;
  }

  const startMessage = [
    colors.title("detoks repl 시작"),
    `  adapter=${colors.info(baseArgs.adapter)}`,
    `  executionMode=${colors.info(baseArgs.executionMode)}`,
    `  verbose=${colors.info(String(baseArgs.verbose))}`,
    "",
    `${colors.muted("stub")} = 모의 출력; ${colors.muted("real")} = 어댑터의 실제 실행 경로`,
    `종료하려면 ${colors.warning('"exit"')}를 입력하세요.\n`,
  ].join("\n");

  output.write(startMessage);

  try {
    while (true) {
      const line = (await rl.question(colors.prompt("detoks> "))).trim();
      if (!line) {
        if (inlineSlashMenuVisible) {
          clearInlineSlashMenu();
          inlineSlashMenuVisible = false;
        }
        inlineSlashMenuVisible = false;
        refreshReadlineLine(rl as unknown as { _refreshLine?: () => void });
        continue;
      }
      const builtinCommand = getReplBuiltinCommand(line);
      if (builtinCommand) {
        if (builtinCommand.kind === "login") {
          const selectedAdapter = await promptForLoginAdapterSelection(replState.adapter);
          if (!selectedAdapter) {
            output.write(`${terminal.warning("! 로그인이 취소되었습니다.")}\n`);
            continue;
          }

          rl.pause();
          output.write(`${terminal.title(`${selectedAdapter} 로그인 시작 중...`)}\n`);
          const exitCode = await runAdapterLoginFlow(selectedAdapter, cwd);
          rl.resume();
          if (exitCode === 0) {
            output.write(`${terminal.success(`✓ ${selectedAdapter} 로그인이 완료되었습니다.`)}\n`);
          } else {
            output.write(`${terminal.error(`✗ ${selectedAdapter} 로그인이 종료 코드 ${exitCode}로 종료되었습니다.`)}\n`);
          }
          continue;
        }

        if (builtinCommand.kind === "menu") {
          if (inlineSlashMenuVisible) {
            clearInlineSlashMenu();
            inlineSlashMenuVisible = false;
            refreshReadlineLine(rl as unknown as { _refreshLine?: () => void });
            continue;
          }

          const menuResult = runReplBuiltinCommand(builtinCommand, replState, sessionId);
          if (menuResult.output) {
            rl.pause();
            await new Promise<void>((resolve, reject) => {
              output.write(menuResult.output, (error) => {
                if (error) {
                  reject(error);
                  return;
                }
                resolve();
              });
            });
            rl.resume();
          }
          continue;
        }

        let resolvedBuiltinCommand = builtinCommand;

        if (builtinCommand.kind === "adapter" && builtinCommand.adapter === undefined) {
          const selectedAdapter = await promptForReplAdapterSelection(replState.adapter);
          if (!selectedAdapter) {
            output.write(`${terminal.warning("! 어댑터 선택이 취소되었습니다.")}\n`);
            refreshReadlineLine(rl as unknown as { _refreshLine?: () => void });
            continue;
          }
          resolvedBuiltinCommand = { kind: "adapter", adapter: selectedAdapter };
        }

        if (builtinCommand.kind === "verbose" && builtinCommand.value === undefined) {
          const selectedVerbose = await promptForVerboseSelection(replState.verbose);
          if (selectedVerbose === null) {
            output.write(`${terminal.warning("! 상세 출력 선택이 취소되었습니다.")}\n`);
            refreshReadlineLine(rl as unknown as { _refreshLine?: () => void });
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
        refreshReadlineLine(rl as unknown as { _refreshLine?: () => void });
        continue;
      }

      try {
        const requestArgs = {
          ...baseArgs,
          ...replState,
          mode: "run" as const,
          prompt: line,
          adapter: replState.adapter,
        };
        const request = toNormalizedRequest(
          requestArgs,
          { mode: "repl", sessionId },
        );
        const spinner = startSpinner(isTTY);
        const result = await runCommand(request).finally(() => spinner.stop());
        if (shouldEmitReplSourceBadge(replState, lastSourceBadgeKey)) {
          output.write(
            `${terminal.adapterBadge(replState.adapter, {
              ...(replState.model !== undefined ? { model: replState.model } : {}),
              executionMode: replState.executionMode,
            })}\n`,
          );
          lastSourceBadgeKey = getReplSourceBadgeKey(replState);
        }

        // 번역 표시 (P3): concise 모드에서 translation 발생 시 결과 앞에 표시
        // (verbose 모드는 compiledPrompt가 JSON에 이미 포함됨)
        if (!replState.verbose && result.compiledPrompt && result.compiledPrompt !== line) {
          output.write(`${terminal.muted(`[translated] ${result.compiledPrompt}`)}\n`);
        }

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
        inlineSlashMenuVisible = false;
        clearInlineSlashMenu();
        if (shouldEmitReplSourceBadge(replState, lastSourceBadgeKey)) {
          output.write(
            `${terminal.adapterBadge(replState.adapter, {
              ...(replState.model !== undefined ? { model: replState.model } : {}),
              executionMode: replState.executionMode,
          })}\n`,
          );
          lastSourceBadgeKey = getReplSourceBadgeKey(replState);
        }
        output.write(`${formatError(error, baseArgs.verbose)}\n`);
      }
      inlineSlashMenuVisible = false;
      refreshReadlineLine(rl as unknown as { _refreshLine?: () => void });
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
    output.write(`\n${colors.info("detoks repl 종료.")}\n`);
  }
};
