import { stdout as output } from "node:process";
import { colors } from "../colors.js";
import {
  getAdapterStatus,
  getAdapterModels,
} from "../adapter-info/index.js";

export interface SlashCommand {
  name: string;
  description: string;
  usage: string;
  aliases?: string[];
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "help",
    aliases: ["h", "?"],
    description: "사용 가능한 모든 명령 목록 표시",
    usage: "/help",
  },
  {
    name: "clear",
    aliases: ["c"],
    description: "화면 지우기",
    usage: "/clear",
  },
  {
    name: "model",
    aliases: ["m"],
    description: "현재 설정된 번역 모델 확인",
    usage: "/model",
  },
  {
    name: "adapter",
    aliases: ["a"],
    description: "현재 설정된 어댑터 확인 (codex/gemini)",
    usage: "/adapter",
  },
  {
    name: "llm-model",
    aliases: ["lm"],
    description: "현재 설정된 LLM 모델 및 인증 상태 확인",
    usage: "/llm-model",
  },
  {
    name: "llm-models",
    aliases: ["lms"],
    description: "사용 가능한 LLM 모델 목록",
    usage: "/llm-models",
  },
  {
    name: "mode",
    aliases: [],
    description: "현재 실행 모드 확인 (stub/real)",
    usage: "/mode",
  },
  {
    name: "verbose",
    aliases: ["v"],
    description: "상세 출력 모드 토글",
    usage: "/verbose",
  },
  {
    name: "exit",
    aliases: ["quit", "q"],
    description: "REPL 종료",
    usage: "/exit",
  },
];

export const getSlashCommand = (input: string): SlashCommand | null => {
  if (!input.startsWith("/")) return null;

  const parts = input.slice(1).split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  return SLASH_COMMANDS.find(
    (c) => c.name === cmd || c.aliases?.includes(cmd ?? ""),
  ) ?? null;
};

export const isSlashCommand = (input: string): boolean => {
  return input.startsWith("/") && getSlashCommand(input) !== null;
};

export const showHelpMessage = (): void => {
  output.write(`\n${colors.title("사용 가능한 명령어\n")}`);

  const maxNameLen = Math.max(...SLASH_COMMANDS.map((c) => c.name.length)) + 1;

  for (const cmd of SLASH_COMMANDS) {
    const aliases = cmd.aliases?.length
      ? ` (${cmd.aliases.join(", ")})`
      : "";
    const nameStr = colors.boldText(`/${cmd.name}${aliases}`);
    const paddedName = nameStr.padEnd(
      nameStr.length + Math.max(0, maxNameLen - cmd.name.length - aliases.length),
    );
    output.write(`  ${paddedName} ${colors.muted(cmd.description)}\n`);
  }

  output.write("\n");
};

export const handleSlashCommand = async (
  input: string,
  state: {
    adapter: string;
    executionMode: string;
    modelName: string | undefined;
    verbose: boolean;
    onVerboseToggle: (enabled: boolean) => void;
    onExit: () => Promise<void>;
  },
): Promise<boolean> => {
  const cmd = getSlashCommand(input);
  if (!cmd) return false;

  switch (cmd.name) {
    case "help":
      showHelpMessage();
      return true;

    case "clear":
      process.stdout.write("\x1Bc");
      return true;

    case "model":
      output.write(
        colors.info(`\n현재 번역 모델: ${state.modelName || "미설정"}\n\n`),
      );
      return true;

    case "adapter":
      output.write(
        colors.info(`\n현재 어댑터: ${state.adapter}\n\n`),
      );
      return true;

    case "llm-model": {
      const status = getAdapterStatus(state.adapter as "codex" | "gemini");
      output.write(`\n${colors.title(state.adapter.toUpperCase())} 설정\n`);
      if (status.authenticated) {
        output.write(
          colors.success(
            `  인증 상태: ${status.account || status.authType || "인증됨"}\n`,
          ),
        );
      } else {
        output.write(colors.warning(`  인증 상태: 미인증\n`));
      }
      if (status.currentModel) {
        output.write(colors.info(`  현재 모델: ${status.currentModel}\n`));
      }
      output.write("\n");
      return true;
    }

    case "llm-models": {
      const models = getAdapterModels(state.adapter as "codex" | "gemini");
      output.write(`\n${colors.title("사용 가능한 LLM 모델\n")}`);
      if (models.length === 0) {
        output.write(colors.warning("  모델을 불러올 수 없습니다.\n\n"));
        return true;
      }
      for (const model of models) {
        output.write(
          colors.info(`  ${colors.boldText(model.slug)}\n`) +
            `    ${colors.muted(model.display_name)}\n`,
        );
      }
      output.write("\n");
      return true;
    }

    case "mode":
      output.write(
        colors.info(
          `\n실행 모드: ${state.executionMode} (stub=모의, real=실제)\n\n`,
        ),
      );
      return true;

    case "verbose":
      const newVerbose = !state.verbose;
      state.onVerboseToggle(newVerbose);
      output.write(
        colors.info(
          `\n상세 출력: ${newVerbose ? colors.success("ON") : colors.warning("OFF")}\n\n`,
        ),
      );
      return true;

    case "exit":
      await state.onExit();
      return true;

    default:
      return false;
  }
};
