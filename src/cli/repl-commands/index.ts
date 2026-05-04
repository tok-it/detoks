import { stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Adapter } from "../../core/pipeline/types.js";
import { colors } from "../colors.js";
import {
  claudeLogout,
  getAdapterStatus,
  getAdapterModels,
  codexLogout,
  geminiLogout,
} from "../adapter-info/index.js";
import { selectWithArrows } from "../interactive/select-with-arrows.js";
import type { SelectWithArrowsStreams } from "../interactive/select-with-arrows.js";
import {
  getCodexReasoningEffortOverride,
  updateAdapterModel,
  updateCodexReasoningEffort,
  updateTranslationModel,
} from "../config/config-manager.js";
import {
  CODEX_REASONING_EFFORT_VALUES,
  type CodexReasoningEffort,
} from "../config/types.js";
import { TRANSLATION_MODELS } from "../model-setup/models.js";
import { downloadModel } from "../model-setup/download.js";
import { updateEnvFile } from "../model-setup/env-writer.js";
import { inspectLocalModelFile, shouldDownloadModelFile } from "../model-setup/file-status.js";

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
    description: "번역 모델 선택 및 변경 (필요시 다운로드)",
    usage: "/model",
  },
  {
    name: "adapter",
    aliases: ["a"],
    description: "현재 설정된 어댑터 확인 (codex/gemini/claude)",
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
  adapter: Adapter,
): SlashCommand[] => {
  if (adapter === "codex") {
    return [
      {
        name: "codex-models",
        aliases: ["cms"],
        description: "Codex 모델 및 추론 강도 선택",
        usage: "/codex-models",
      },
      {
        name: "logout",
        aliases: ["out"],
        description: "현재 어댑터에서 로그아웃",
        usage: "/logout",
      },
    ];
  }

  if (adapter === "gemini") {
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

  return [
    {
      name: "logout",
      aliases: ["out"],
      description: "현재 어댑터에서 로그아웃",
      usage: "/logout",
    },
  ];
};

const isAuthenticated = (adapter: Adapter): boolean => {
  const status = getAdapterStatus(adapter);
  return status.authenticated;
};

export const getActiveSlashCommands = (
  adapter: Adapter,
): SlashCommand[] => {
  const authCommands = isAuthenticated(adapter)
    ? getAuthenticatedCommands(adapter)
    : [];
  return [...BASE_COMMANDS, ...authCommands];
};

export const getSlashCommand = (
  input: string,
  adapter: Adapter,
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
  adapter: Adapter,
): boolean => {
  return input.startsWith("/") && getSlashCommand(input, adapter) !== null;
};

const getLoginHint = (adapter: Adapter): string =>
  adapter === "claude" ? "claude auth login" : `${adapter} login`;

const getLogoutHint = (adapter: Adapter): string =>
  adapter === "claude" ? "claude auth logout" : `${adapter} logout`;

export const showHelpMessage = (adapter: Adapter): void => {
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
        `   외부에서 '${getLoginHint(adapter)}' 명령어를 실행한 후 사용하세요.\n`,
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
    onAdapterChange: (newAdapter: Adapter) => Promise<void>;
    onExit: () => Promise<void>;
    onInteractiveStart?: () => void;
    onInteractiveEnd?: () => void;
  },
): Promise<boolean> => {
  const adapter = state.adapter as Adapter;
  const selectStreams: SelectWithArrowsStreams = {
    ...(state.onInteractiveStart ? { onOpen: state.onInteractiveStart } : {}),
    ...(state.onInteractiveEnd ? { onClose: state.onInteractiveEnd } : {}),
  };
  const cmd = getSlashCommand(input, adapter);
  if (!cmd) return false;

  switch (cmd.name) {
    case "help":
      showHelpMessage(adapter);
      return true;

    case "clear":
      process.stdout.write("\x1Bc");
      return true;

    case "model": {
      return await handleTranslationModel(selectStreams);
    }

    case "adapter": {
      return await handleAdapterSwitch(adapter, state.onAdapterChange, selectStreams);
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

    case "codex-models": {
      return await handleCodexModels(selectStreams);
    }

    case "gemini-models": {
      return await handleGeminiModels(selectStreams);
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

const handleCodexModels = async (streams?: SelectWithArrowsStreams): Promise<boolean> => {
  const models = getAdapterModels("codex");

  if (models.length === 0) {
    output.write(colors.warning("\n모델을 불러올 수 없습니다.\n\n"));
    return true;
  }

  const options = models.map((m) => ({
    value: m.slug,
    label: `${m.slug} — ${m.display_name}`,
  }));

  let shouldResumeInput = true;

  try {
    const selected = await selectWithArrows(options, "Codex 모델 선택", {
      ...streams,
      onClose: () => undefined,
    });

    if (!selected) {
      streams?.onClose?.();
      shouldResumeInput = false;
      return true;
    }

    process.env.ADAPTER_MODEL = selected;
    updateAdapterModel("codex", selected);

    const currentEffort = getCodexReasoningEffortOverride();
    const currentEffortLabel = currentEffort
      ? formatCodexReasoningEffortLabel(currentEffort)
      : "기본 설정 사용";
    output.write(colors.muted(`  현재 추론 강도: ${currentEffortLabel}\n\n`));

    const selectedEffort = await selectCodexReasoningEffort(selected, currentEffort, streams);
    if (selectedEffort === null) {
      output.write(colors.muted("  추론 강도 선택을 취소했습니다. 기존 설정을 유지합니다.\n\n"));
    } else {
      if (selectedEffort === currentEffort) {
        output.write(
          colors.info(
            selectedEffort
              ? `  추론 강도는 이미 ${formatCodexReasoningEffortLabel(selectedEffort)}입니다.\n`
              : "  추론 강도는 이미 Codex 기본 설정을 사용하고 있습니다.\n",
          ),
        );
      } else {
        updateCodexReasoningEffort(selectedEffort ?? undefined);
        output.write(
          colors.success(
            selectedEffort
              ? `  추론 강도가 ${formatCodexReasoningEffortLabel(selectedEffort)}(으)로 설정되었습니다.\n`
              : "  추론 강도 오버라이드가 제거되어 Codex 기본 설정을 사용합니다.\n",
          ),
        );
      }
    }

    output.write(colors.muted(`  설정 저장됨: ~/.detoks/settings.json\n\n`));
    shouldResumeInput = false;
    return true;
  } finally {
    if (shouldResumeInput) {
      streams?.onClose?.();
    }
  }
};

const CODEX_REASONING_EFFORT_LABELS: Record<CodexReasoningEffort, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
};

const formatCodexReasoningEffortLabel = (effort: CodexReasoningEffort): string =>
  CODEX_REASONING_EFFORT_LABELS[effort];

const buildCodexReasoningEffortOptions = (
  currentEffort: CodexReasoningEffort | undefined,
): { value: string; label: string }[] => {
  const options: { value: string; label: string }[] = [];

  if (currentEffort) {
    options.push({
      value: currentEffort,
      label: `${formatCodexReasoningEffortLabel(currentEffort)} (현재)`,
    });
  }

  options.push({
    value: "default",
    label: "기본값 유지 (Codex 기본 설정)",
  });

  for (const effort of CODEX_REASONING_EFFORT_VALUES) {
    if (effort === currentEffort) {
      continue;
    }

    options.push({
      value: effort,
      label: formatCodexReasoningEffortLabel(effort),
    });
  }

  return options;
};

const selectCodexReasoningEffort = async (
  modelName: string,
  currentEffort: CodexReasoningEffort | undefined,
  streams?: SelectWithArrowsStreams,
): Promise<CodexReasoningEffort | undefined | null> => {
  output.write(colors.title(`Codex 추론 강도 선택 (${modelName})\n`));
  output.write(
    colors.muted(
      "Low / Medium / High / Extra high 중 하나를 선택하거나 기본 Codex 설정을 유지할 수 있습니다.\n\n",
    ),
  );

  const selected = await selectWithArrows(
    buildCodexReasoningEffortOptions(currentEffort),
    "추론 강도 선택",
    streams,
  );

  if (selected === null) {
    return null;
  }

  if (selected === "default") {
    return undefined;
  }

  return selected as CodexReasoningEffort;
};

const handleGeminiModels = async (streams?: SelectWithArrowsStreams): Promise<boolean> => {
  const models = getAdapterModels("gemini");

  if (models.length === 0) {
    output.write(colors.warning("\n모델을 불러올 수 없습니다.\n\n"));
    return true;
  }

  const options = models.map((m) => ({
    value: m.slug,
    label: `${m.slug} — ${m.display_name}`,
  }));

  const selected = await selectWithArrows(options, "Gemini 모델 선택", streams);

  if (selected) {
    process.env.ADAPTER_MODEL = selected;
    updateAdapterModel("gemini", selected);
    output.write(
      colors.muted(
        `  설정 저장됨: ~/.detoks/settings.json\n\n`,
      ),
    );
  }

  return true;
};

const handleLogout = async (adapter: Adapter): Promise<boolean> => {
  output.write(`\n${colors.title(`${adapter.toUpperCase()} 로그아웃\n`)}`);

  const success =
    adapter === "codex"
      ? codexLogout()
      : adapter === "gemini"
        ? geminiLogout()
        : claudeLogout();

  if (success) {
    output.write(
      colors.success(`✓ ${adapter.toUpperCase()}에서 로그아웃되었습니다.\n\n`),
    );
  } else {
    output.write(
      colors.error(
        `✗ 로그아웃 실패. 외부에서 '${getLogoutHint(adapter)}' 명령어를 실행해주세요.\n\n`,
      ),
    );
  }

  return true;
};

const getModelsDir = (): string => {
  return join(homedir(), ".detoks", "models");
};

const getModelFileStatus = (hfFile: string) => {
  const modelsDir = getModelsDir();
  const filePath = join(modelsDir, hfFile);
  return inspectLocalModelFile(filePath);
};

const handleTranslationModel = async (streams?: SelectWithArrowsStreams): Promise<boolean> => {
  output.write(`\n${colors.title("한글→영어 번역 모델 선택\n")}`);

  // 모델 목록 생성
  const options = TRANSLATION_MODELS.map((model) => {
    const fileStatus = getModelFileStatus(model.hfFile);
    const status =
      fileStatus.kind === "ready"
        ? ` ${colors.success("[설치됨]")}`
        : fileStatus.kind === "invalid"
          ? ` ${colors.warning(`[손상됨:${fileStatus.reason}]`)}`
          : "";
    return {
      value: model.id,
      label: `${model.displayName}${status}`,
      model,
    };
  });

  // 모델 정보 표시
  for (const opt of options) {
    const model = opt.model;
    if (model) {
      output.write(`${colors.muted(opt.label)}\n`);
      output.write(`   ${colors.muted(model.description)}\n`);
      output.write("\n");
    }
  }

  output.write(
    colors.muted("손상된 모델은 선택 후 Enter를 누르면 재설치됩니다.\n\n"),
  );

  // 모델 선택
  const selectedId = await selectWithArrows(
    options.map((opt) => ({
      value: opt.value,
      label: opt.label,
    })),
    "모델 선택",
    streams,
  );

  if (!selectedId) {
    return true;
  }

  const selectedModel = TRANSLATION_MODELS.find((m) => m.id === selectedId);
  if (!selectedModel) {
    output.write(colors.error("\n✗ 모델을 찾을 수 없습니다.\n\n"));
    return true;
  }

  const fileStatus = getModelFileStatus(selectedModel.hfFile);

  // 정상 파일은 재사용하고, 손상/누락 파일은 명시적 선택 시 재다운로드
  if (fileStatus.kind === "invalid") {
    output.write(
      colors.warning(
        `\n⚠️  손상된 GGUF 파일이 감지되었습니다. 이 모델을 다시 다운로드해 덮어씁니다: ${selectedModel.hfFile} (${fileStatus.reason})\n`,
      ),
    );
  }

  if (shouldDownloadModelFile(fileStatus)) {
    output.write(
      colors.warning(
        `\n⬇️  ${selectedModel.displayName} 다운로드 시작...\n\n`,
      ),
    );

    try {
      await downloadModel(selectedModel);
    } catch (error) {
      output.write(
        colors.error(
          `\n✗ 다운로드 실패. 인터넷 연결을 확인하고 다시 시도하세요.\n\n`,
        ),
      );
      return true;
    }
  }

  // 환경변수 및 설정 업데이트
  process.env.LOCAL_LLM_MODEL_NAME = selectedModel.modelName;
  process.env.LOCAL_LLM_HF_REPO = `${selectedModel.hfRepo}:Q4_K_S`;
  process.env.LOCAL_LLM_HF_FILE = selectedModel.hfFile;

  // .env 파일 업데이트
  updateEnvFile(selectedModel, process.cwd());

  // 설정 저장
  updateTranslationModel(selectedModel.modelName);

  output.write(
    colors.success(
      `\n✓ 번역 모델이 '${selectedModel.displayName}'로 변경되었습니다.\n`,
    ),
  );
  output.write(
    colors.muted(`  설정 저장됨: ~/.detoks/settings.json\n\n`),
  );

  return true;
};

const handleAdapterSwitch = async (
  currentAdapter: Adapter,
  onAdapterChange: (newAdapter: Adapter) => Promise<void>,
  streams?: SelectWithArrowsStreams,
): Promise<boolean> => {
  output.write(`\n${colors.title("어댑터 선택")}\n\n`);

  const adapters: Adapter[] = ["codex", "gemini", "claude"];
  const options = adapters.map((a) => {
    const status = getAdapterStatus(a);
    const statusStr = status.authenticated
      ? colors.success(`✓ 로그인됨 (${status.account || status.authType || "인증됨"})`)
      : colors.warning(`✗ 미인증`);
    return {
      value: a,
      label: `${a.toUpperCase()} ${statusStr}`,
    };
  });

  const selected = await selectWithArrows(options, "어댑터 선택", streams);

  if (!selected) {
    return true;
  }

  const newAdapter = selected as Adapter;

  if (newAdapter === currentAdapter) {
    output.write(colors.info(`\n현재 어댑터: ${currentAdapter}\n\n`));
    return true;
  }

  const newAdapterStatus = getAdapterStatus(newAdapter);

  if (!newAdapterStatus.authenticated) {
    output.write(
      colors.warning(
        `\n⚠️  ${newAdapter.toUpperCase()}는 인증이 필요합니다.\n\n`,
      ),
    );
    output.write(
      colors.muted(
        `다른 터미널에서 다음 명령을 실행한 후 다시 시도하세요:\n`,
      ),
    );
    output.write(colors.info(`  ${getLoginHint(newAdapter)}\n\n`));
    return true;
  }

  await onAdapterChange(newAdapter);

  output.write(
    colors.success(
      `\n✓ 어댑터가 '${newAdapter.toUpperCase()}'로 변경되었습니다.\n\n`,
    ),
  );

  return true;
};
