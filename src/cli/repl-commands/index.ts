import { stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { colors } from "../colors.js";
import {
  getAdapterStatus,
  getAdapterModels,
  codexLogout,
  geminiLogout,
} from "../adapter-info/index.js";

export interface SlashCommand {
  name: string;
  description: string;
  usage: string;
  aliases?: string[];
}

const BASE_COMMANDS: SlashCommand[] = [
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

const getAuthenticatedCommands = (
  adapter: "codex" | "gemini",
): SlashCommand[] => {
  if (adapter === "codex") {
    return [
      {
        name: "codex-models",
        aliases: ["cms"],
        description: "Codex 모델 선택 및 변경",
        usage: "/codex-models",
      },
      {
        name: "logout",
        aliases: ["out"],
        description: "현재 어댑터에서 로그아웃",
        usage: "/logout",
      },
    ];
  } else {
    return [
      {
        name: "gemini-models",
        aliases: ["gms"],
        description: "Gemini 모델 선택 및 변경",
        usage: "/gemini-models",
      },
      {
        name: "logout",
        aliases: ["out"],
        description: "현재 어댑터에서 로그아웃",
        usage: "/logout",
      },
    ];
  }
};

const isAuthenticated = (adapter: "codex" | "gemini"): boolean => {
  const status = getAdapterStatus(adapter);
  return status.authenticated;
};

export const getActiveSlashCommands = (
  adapter: "codex" | "gemini",
): SlashCommand[] => {
  const authCommands = isAuthenticated(adapter)
    ? getAuthenticatedCommands(adapter)
    : [];
  return [...BASE_COMMANDS, ...authCommands];
};

export const getSlashCommand = (
  input: string,
  adapter: "codex" | "gemini",
): SlashCommand | null => {
  if (!input.startsWith("/")) return null;

  const parts = input.slice(1).split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  const activeCommands = getActiveSlashCommands(adapter);
  return (
    activeCommands.find(
      (c) => c.name === cmd || c.aliases?.includes(cmd ?? ""),
    ) ?? null
  );
};

export const isSlashCommand = (
  input: string,
  adapter: "codex" | "gemini",
): boolean => {
  return input.startsWith("/") && getSlashCommand(input, adapter) !== null;
};

export const showHelpMessage = (adapter: "codex" | "gemini"): void => {
  output.write(`\n${colors.title("사용 가능한 명령어\n")}`);

  const activeCommands = getActiveSlashCommands(adapter);
  const maxNameLen = Math.max(
    ...activeCommands.map((c) => c.name.length),
  ) + 1;

  for (const cmd of activeCommands) {
    const aliases = cmd.aliases?.length
      ? ` (${cmd.aliases.join(", ")})`
      : "";
    const nameStr = colors.boldText(`/${cmd.name}${aliases}`);
    const paddedName = nameStr.padEnd(
      nameStr.length + Math.max(0, maxNameLen - cmd.name.length - aliases.length),
    );
    output.write(`  ${paddedName} ${colors.muted(cmd.description)}\n`);
  }

  // 미인증 상태 경고
  if (!isAuthenticated(adapter)) {
    output.write("\n");
    output.write(
      colors.warning(
        `⚠️  API 인증이 필요합니다.\n`,
      ),
    );
    output.write(
      colors.muted(
        `   외부에서 '${adapter} login' 명령어를 실행한 후 사용하세요.\n`,
      ),
    );
  } else {
    output.write("\n");
    const adapterName = adapter.toUpperCase();
    const status = getAdapterStatus(adapter);
    output.write(
      colors.success(
        `✓ ${adapterName} 로그인됨 (${status.account || status.authType || "인증됨"})\n`,
      ),
    );
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
    rl?: ReturnType<typeof createInterface>;
  },
): Promise<boolean> => {
  const adapter = state.adapter as "codex" | "gemini";
  const cmd = getSlashCommand(input, adapter);
  if (!cmd) return false;

  switch (cmd.name) {
    case "help":
      showHelpMessage(adapter);
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
        colors.info(`\n현재 어댑터: ${adapter}\n\n`),
      );
      return true;

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

    case "codex-models": {
      return await handleCodexModels(state.rl);
    }

    case "gemini-models": {
      return await handleGeminiModels(state.rl);
    }

    case "logout": {
      return await handleLogout(adapter);
    }

    case "exit":
      await state.onExit();
      return true;

    default:
      return false;
  }
};

const handleCodexModels = async (
  rl: ReturnType<typeof createInterface> | undefined,
): Promise<boolean> => {
  const models = getAdapterModels("codex");
  output.write(`\n${colors.title("Codex 모델 선택\n")}`);

  if (models.length === 0) {
    output.write(colors.warning("  모델을 불러올 수 없습니다.\n\n"));
    return true;
  }

  // 모델 목록 표시
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    if (model) {
      output.write(`  ${colors.boldText(`${i + 1}.`)} ${model.slug}\n`);
      output.write(`     ${colors.muted(model.display_name)}\n`);
    }
  }

  // 번호 입력받기
  if (!rl) {
    output.write("\n");
    return true;
  }

  try {
    const choice = await rl.question(
      colors.prompt(
        `\n모델 번호를 선택하세요 (1-${models.length}): `,
      ),
    );
    const selectedIndex = parseInt(choice, 10) - 1;
    const selected = models[selectedIndex];

    if (selected) {
      process.env.ADAPTER_MODEL = selected.slug;
      output.write(
        colors.success(
          `\n✓ Codex 모델이 '${selected.slug}'로 변경되었습니다.\n\n`,
        ),
      );
    } else {
      output.write(colors.error("\n✗ 잘못된 선택입니다.\n\n"));
    }
  } catch {
    output.write(colors.error("\n✗ 입력 오류가 발생했습니다.\n\n"));
  }

  return true;
};

const handleGeminiModels = async (
  rl: ReturnType<typeof createInterface> | undefined,
): Promise<boolean> => {
  const models = getAdapterModels("gemini");
  output.write(`\n${colors.title("Gemini 모델 선택\n")}`);

  if (models.length === 0) {
    output.write(colors.warning("  모델을 불러올 수 없습니다.\n\n"));
    return true;
  }

  // 모델 목록 표시
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    if (model) {
      output.write(`  ${colors.boldText(`${i + 1}.`)} ${model.slug}\n`);
      output.write(`     ${colors.muted(model.display_name)}\n`);
    }
  }

  // 번호 입력받기
  if (!rl) {
    output.write("\n");
    return true;
  }

  try {
    const choice = await rl.question(
      colors.prompt(
        `\n모델 번호를 선택하세요 (1-${models.length}): `,
      ),
    );
    const selectedIndex = parseInt(choice, 10) - 1;
    const selected = models[selectedIndex];

    if (selected) {
      process.env.ADAPTER_MODEL = selected.slug;
      output.write(
        colors.success(
          `\n✓ Gemini 모델이 '${selected.slug}'로 변경되었습니다.\n\n`,
        ),
      );
    } else {
      output.write(colors.error("\n✗ 잘못된 선택입니다.\n\n"));
    }
  } catch {
    output.write(colors.error("\n✗ 입력 오류가 발생했습니다.\n\n"));
  }

  return true;
};

const handleLogout = async (adapter: "codex" | "gemini"): Promise<boolean> => {
  output.write(`\n${colors.title(`${adapter.toUpperCase()} 로그아웃\n`)}`);

  const success = adapter === "codex" ? codexLogout() : geminiLogout();

  if (success) {
    output.write(
      colors.success(`✓ ${adapter.toUpperCase()}에서 로그아웃되었습니다.\n\n`),
    );
  } else {
    output.write(
      colors.error(
        `✗ 로그아웃 실패. 외부에서 '${adapter} logout' 명령어를 실행해주세요.\n\n`,
      ),
    );
  }

  return true;
};
