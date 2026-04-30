import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { formatError, formatReplResult } from "../format.js";
import { getCliUsage, toNormalizedRequest } from "../parse.js";
import type { CliArgs } from "../types.js";
import type { PipelineProgressEvent } from "../../core/pipeline/types.js";
import type { ReplSession } from "../repl/ReplRegistry.js";
import { runCommand } from "./run.js";
import { colors } from "../colors.js";
import { runModelSetupIfNeeded } from "../model-setup/index.js";
import { showHelpMessage, handleSlashCommand } from "../repl-commands/index.js";
import { buildPrompt } from "../interactive/prompt-builder.js";
import { loadAndApplyConfig } from "../config/loader.js";
import { updateSelectedAdapter } from "../config/config-manager.js";
import { startSpinner } from "../terminal-spinner.js";

const EXIT_COMMANDS = new Set(["exit", "quit", ".exit"]);
const EXIT_BUILTIN_COMMANDS = new Set(["exit", "quit", ".exit", "/exit", "/quit"]);
const LOGIN_MENU_OPTIONS = ["codex", "gemini"] as const;
const VERBOSE_MENU_OPTIONS = ["on", "off"] as const;

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
  adapter: CliArgs["adapter"];
  model?: string;
  executionMode: CliArgs["executionMode"];
  verbose: boolean;
}

const formatProgressEvent = (event: PipelineProgressEvent): string => {
  const icon =
    event.status === "end"
      ? colors.success("✓")
      : event.status === "error"
        ? colors.error("✗")
        : event.status === "skip"
          ? colors.warning("↷")
          : colors.info("•");

  return `${icon} ${event.message}`;
};

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

  if (line === "/help") {
    return { kind: "help" };
  }

  if (line === "/login") {
    return { kind: "login" };
  }

  if (EXIT_BUILTIN_COMMANDS.has(line)) {
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
    if (LOGIN_MENU_OPTIONS.includes(adapter as (typeof LOGIN_MENU_OPTIONS)[number])) {
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

export const getLoginCommandSpec = (
  adapter: CliArgs["adapter"],
): { command: string; args: string[] } => {
  if (adapter === "codex") {
    return { command: "codex", args: ["login"] };
  }

  return { command: "gemini", args: [] };
};

function formatReplCommandMenu(state: ReplRuntimeState): string {
  const commands = [
    ["/help", "REPL 도움말 표시"],
    ["/login", "Codex/Gemini 로그인 흐름 시작"],
    ["/session", "현재 REPL 세션과 런타임 정보 확인"],
    ["/adapter", "어댑터 선택 UI 표시"],
    ["/adapter codex", "이후 프롬프트의 어댑터를 codex로 변경"],
    ["/adapter gemini", "이후 프롬프트의 어댑터를 gemini로 변경"],
    ["/codex-models (/cms)", "Codex 모델 및 추론 강도 선택"],
    ["/gemini-models (/gms)", "Gemini 모델 선택 및 변경"],
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
    "REPL 명령어 목록",
    `현재 소스: ${getReplPromptLabel(state).trimEnd()}`,
    "",
    ...commands.map(([command, description]) => `${command.padEnd(18)} ${description}`),
    "",
    "명령을 입력하거나 /help를 입력해 자세한 도움말을 볼 수 있습니다.",
  ];

  return `${lines.join("\n")}\n`;
}

export const runReplBuiltinCommand = (
  command: ReplBuiltinCommand,
  state: ReplRuntimeState,
  sessionId: string,
): { shouldExit: boolean; output: string; nextState: ReplRuntimeState } => {
  if (command.kind === "menu") {
    return {
      shouldExit: false,
      output: formatReplCommandMenu(state),
      nextState: state,
    };
  }

  if (command.kind === "help") {
    return {
      shouldExit: false,
      output: `${getCliUsage("repl")}\n`,
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
              message: "/adapter codex 또는 /adapter gemini 를 입력해 어댑터를 변경하세요.",
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
            message: `REPL 어댑터가 ${nextState.adapter}(으)로 설정되었습니다.`,
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
              message: "/model <이름> 을 입력해 이후 프롬프트의 모델을 변경하세요.",
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
            message: `REPL 모델이 ${nextState.model}(으)로 설정되었습니다.`,
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
            message: "/verbose on 또는 /verbose off 를 입력해 상세 출력을 변경하세요.",
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
          message: `REPL 상세 출력이 ${String(nextState.verbose)}(으)로 설정되었습니다.`,
        },
        null,
        2,
      ) + "\n",
    nextState,
  };
};

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
  // 저장된 설정 로드 및 환경변수 적용 (CLI adapter에 맞는 모델만 로드)
  loadAndApplyConfig(baseArgs.adapter as "codex" | "gemini");

  await runModelSetupIfNeeded();

  const rl = createInterface({ input, output });
  const sessionId = `repl-${Date.now()}`;
  let verbose = baseArgs.verbose;
  let currentAdapter = baseArgs.adapter as "codex" | "gemini";

  const startMessage = [
    colors.title("detoks repl 시작"),
    `  adapter=${colors.info(baseArgs.adapter)}`,
    `  executionMode=${colors.info(baseArgs.executionMode)}`,
    `  verbose=${colors.info(String(verbose))}`,
    "",
    `${colors.muted("stub")} = 모의 출력; ${colors.muted("real")} = 어댑터의 실제 실행 경로`,
    colors.info(`명령어 목록을 보려면 ${colors.boldText('"/help"')}를 입력하세요.\n`),
  ].join("\n");

  output.write(startMessage);
  showHelpMessage(currentAdapter);

  try {
    while (true) {
      let line: string;
      try {
        const promptStr = buildPrompt({
          adapter: currentAdapter,
          adapterModel: process.env.ADAPTER_MODEL,
          translationModel: process.env.LOCAL_LLM_MODEL_NAME,
        });
        line = (await rl.question(promptStr)).trim();
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message === "readline was closed" ||
            error.message.includes("readline was closed"))
        ) {
          break;
        }

        throw error;
      }
      if (!line) {
        continue;
      }
      if (EXIT_COMMANDS.has(line)) {
        break;
      }

      // Slash 명령 처리
      if (line.startsWith("/")) {
        let handled = false;

        try {
          handled = await handleSlashCommand(line, {
            adapter: currentAdapter,
            executionMode: baseArgs.executionMode,
            modelName: process.env.LOCAL_LLM_MODEL_NAME,
            verbose,
            onVerboseToggle: (enabled) => {
              verbose = enabled;
            },
            onAdapterChange: async (newAdapter) => {
              currentAdapter = newAdapter;
              loadAndApplyConfig(newAdapter);
              updateSelectedAdapter(newAdapter);
              showHelpMessage(newAdapter);
            },
            onInteractiveStart: () => {
              rl.pause();
            },
            onInteractiveEnd: () => {
              rl.resume();
            },
            onExit: async () => {
              rl.close();
            },
          });
        } catch (error) {
          output.write(
            colors.error(
              `\n선택 UI 처리 중 오류가 발생했습니다.\n${formatError(error, verbose)}\n\n`,
            ),
          );
          continue;
        }

        if (handled) {
          continue;
        } else {
          output.write(
            colors.warning(
              `\n알 수 없는 명령어: ${line}\n도움말을 보려면 "/help"를 입력하세요.\n\n`,
            ),
          );
          continue;
        }
      }

      try {
        const request = toNormalizedRequest(
          { ...baseArgs, mode: "run", prompt: line },
          { mode: "repl", sessionId },
        );
        const spinner = startSpinner(Boolean(output.isTTY), output);
        const onProgress = async (event: PipelineProgressEvent): Promise<void> => {
          spinner.write(`${formatProgressEvent(event)}\n`);
        };

        try {
          const result = await runCommand({ ...request, onProgress });
          spinner.stop();
          output.write(`${formatReplResult(result, verbose)}\n`);
        } catch (error) {
          spinner.stop();
          throw error;
        }
      } catch (error) {
        output.write(`${formatError(error, verbose)}\n`);
      }
    }
  } finally {
    rl.close();
    output.write(`\n${colors.info("detoks repl 종료.")}\n`);
  }
};
