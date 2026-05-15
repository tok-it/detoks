import { stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { spawnSync } from "node:child_process";
import type { Adapter } from "../../core/pipeline/types.js";
import { colors } from "../colors.js";
import {
  claudeLogout,
  getAdapterStatus,
  getAdapterModels,
  getClaudeAvailableModels,
  codexLogout,
  geminiLogout,
} from "../adapter-info/index.js";
import { selectWithArrows } from "../interactive/select-with-arrows.js";
import type { SelectOption, SelectWithArrowsStreams } from "../interactive/select-with-arrows.js";
import { invalidateCache } from "../cache/cache-manager.js";
import { getCacheStats, clearExpiredSessions, formatCacheStats } from "./cache-command.js";
import { CACHE_TTL_DAYS } from "../../core/cache/cache-config.js";
import { resolveSessionsDir } from "../../core/state/SessionStateManager.js";
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
import {
  TRANSLATION_MODELS,
  CUSTOM_MODEL_MENU_VALUE,
  CUSTOM_MODEL_RECENT_VALUE,
  buildCustomTranslationModel,
  type TranslationModel,
} from "../model-setup/models.js";
import { downloadModel } from "../model-setup/download.js";
import { updateEnvFile } from "../model-setup/env-writer.js";
import { inspectLocalModelFile, shouldDownloadModelFile } from "../model-setup/file-status.js";
import {
  getDetoksModelDir,
  getDetoksModelFilePath,
} from "../../core/model-store.js";
import { loadLastCustomModel, saveCustomModel } from "../model-setup/custom-store.js";
import { parseHfRepoInput, listGgufFiles, HfRepoError } from "../model-setup/hf-repo.js";
import { promptLine } from "../interactive/prompt-line.js";

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
    name: "cache",
    aliases: ["ca"],
    description: "캐시 상태 확인 및 관리 (stats/clear/disable/enable)",
    usage: "/cache [stats|clear|disable|enable]",
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
      name: "claude-models",
      aliases: ["cls"],
      description: "Claude 모델 선택",
      usage: "/claude-models",
    },
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

export const getAdapterLoginCommandSpec = (
  adapter: Adapter,
): { command: string; args: string[] } => {
  if (adapter === "codex") {
    return { command: "codex", args: ["login"] };
  }

  if (adapter === "gemini") {
    return { command: "gemini", args: [] };
  }

  return { command: "claude", args: ["auth", "login"] };
};

const getLoginHint = (adapter: Adapter): string => {
  const spec = getAdapterLoginCommandSpec(adapter);
  return [spec.command, ...spec.args].join(" ").trim();
};

const getLogoutHint = (adapter: Adapter): string =>
  adapter === "claude" ? "claude auth logout" : `${adapter} logout`;

interface AdapterCliReferenceSection {
  title: string;
  commands: string[];
  note?: string;
}

const getAdapterCliReferenceSections = (): AdapterCliReferenceSection[] => [
  {
    title: "Codex CLI",
    commands: [
      "codex login",
      "codex login status",
      "codex debug models",
      "codex /goal <objective>",
      "codex /goal pause | resume | clear",
      "codex logout",
    ],
    note: "로그인 / 상태 / 모델 조회 / 목표 관리(/goal)는 Codex 원본 CLI에서 처리합니다.",
  },
  {
    title: "Gemini CLI",
    commands: ["gemini"],
    note: "인증 진입은 gemini로 하고, 모델 선택은 detoks /gms가 맡습니다.",
  },
  {
    title: "Claude Code",
    commands: [
      "claude auth login",
      "claude auth status --json",
      "claude --model <model>",
      "claude auth logout",
    ],
    note: "Claude는 auth 후 detoks /claude-models가 모델 선택을 맡고, 실행 시 --model로 전달됩니다.",
  },
];

export const formatAdapterCliReference = (): string => {
  const lines: string[] = [
    "",
    `${colors.title("외부 adapter CLI 참고")}`,
    "",
  ];

  for (const section of getAdapterCliReferenceSections()) {
    lines.push(`  ${colors.boldText(section.title)}`);
    for (const command of section.commands) {
      lines.push(`    ${colors.muted(command)}`);
    }
    if (section.note) {
      lines.push(`    ${colors.muted(section.note)}`);
    }
    lines.push("");
  }

  lines.push(
    colors.muted(
      "  detoks 명령은 REPL 안에서, adapter CLI 원본 명령은 외부 터미널에서 사용하세요.",
    ),
  );
  lines.push("");

  return `${lines.join("\n")}\n`;
};

const buildSlashCommandMenuOptions = (
  adapter: Adapter,
): SelectOption[] =>
  getActiveSlashCommands(adapter).map((command) => ({
    value: command.usage,
    label: `${command.usage}${command.aliases?.length ? ` (${command.aliases.join(", ")})` : ""} — ${command.description}`,
  }));

const formatSlashCommandMenuText = (adapter: Adapter): string => {
  const commands = getActiveSlashCommands(adapter);
  const maxUsageLen = Math.max(
    ...commands.map((command) => command.usage.length),
    0,
  );

  const lines = [
    "REPL 명령 선택",
    "",
    ...commands.map((command) => {
      const aliases = command.aliases?.length ? ` (${command.aliases.join(", ")})` : "";
      return `${command.usage.padEnd(maxUsageLen + 1)}${aliases} ${command.description}`;
    }),
    "",
    "↑↓ 선택 · Enter 실행 · ESC 취소",
  ];

  return `${lines.join("\n")}\n`;
};

const openSlashCommandMenu = async (
  adapter: Adapter,
  streams?: SelectWithArrowsStreams,
): Promise<string | null> => {
  const options = buildSlashCommandMenuOptions(adapter);

  if (options.length === 0) {
    output.write(colors.warning("\n선택 가능한 명령이 없습니다.\n\n"));
    return null;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    output.write(formatSlashCommandMenuText(adapter));
    return null;
  }

  return await selectWithArrows(options, "REPL 명령 선택", {
    ...streams,
    useAltScreen: Boolean(streams?.onOpen),
  });
};

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

  output.write(formatAdapterCliReference());
  output.write("\n");
};

const runAdapterAuthLogin = (
  adapter: Adapter,
  streams?: SelectWithArrowsStreams,
): boolean => {
  const status = getAdapterStatus(adapter);
  if (status.authenticated) {
    output.write(
      colors.success(
        `\n✓ ${adapter.toUpperCase()}는 이미 인증되어 있습니다 (${status.account || status.authType || "인증됨"})\n\n`,
      ),
    );
    return true;
  }

  const { command, args } = getAdapterLoginCommandSpec(adapter);

  output.write(`\n${colors.title(`${adapter.toUpperCase()} 인증`)}`);
  output.write(
    colors.muted(
      `\n다음 명령을 실행합니다: ${[command, ...args].join(" ")}\n\n`,
    ),
  );

  streams?.onOpen?.();
  try {
    const result = spawnSync(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });

    if (result.error) {
      output.write(
        colors.error(
          `\n✗ 인증 명령 실행 실패. ${result.error.message}\n\n`,
        ),
      );
      return false;
    }

    if (result.status === 0) {
      invalidateCache("adapter-status", adapter);
      invalidateCache("adapter-config", adapter);
      invalidateCache("adapter-models", adapter);
      output.write(
        colors.success(`\n✓ ${adapter.toUpperCase()} 인증이 완료되었습니다.\n\n`),
      );
      return true;
    }

    output.write(
      colors.warning(
        `\n⚠️  ${adapter.toUpperCase()} 인증이 완료되지 않았습니다. 외부 터미널에서 '${getLoginHint(adapter)}'를 다시 시도하세요.\n\n`,
      ),
    );
    return false;
  } finally {
    streams?.onClose?.();
  }
};

export const handleSlashCommand = async (
  input: string,
  state: {
    adapter: string;
    executionMode: string;
    modelName: string | undefined;
    verbose: boolean;
    cacheDisabled?: boolean;
    onVerboseToggle: (enabled: boolean) => void;
    onCacheDisableToggle?: (disabled: boolean) => void;
    onAdapterChange: (newAdapter: Adapter) => Promise<void>;
    onExit: () => Promise<void>;
    onMainScreenRestore?: () => void;
    onInteractiveStart?: () => void;
    onInteractiveEnd?: () => void;
  },
): Promise<boolean> => {
  const adapter = state.adapter as Adapter;
  const selectStreams: SelectWithArrowsStreams = {
    ...(state.onInteractiveStart ? { onOpen: state.onInteractiveStart } : {}),
    ...(state.onInteractiveEnd ? { onClose: state.onInteractiveEnd } : {}),
    useAltScreen: Boolean(state.onInteractiveStart),
  };
  if (input.trim() === "/") {
    const selected = await openSlashCommandMenu(adapter, selectStreams);
    if (!selected) {
      return true;
    }

    return await handleSlashCommand(selected, state);
  }

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
      const handled = await handleTranslationModel(selectStreams);
      state.onMainScreenRestore?.();
      return handled;
    }

    case "adapter": {
      const handled = await handleAdapterSwitch(adapter, state.onAdapterChange, selectStreams);
      state.onMainScreenRestore?.();
      return handled;
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
      const handled = await handleCodexModels(selectStreams);
      state.onMainScreenRestore?.();
      return handled;
    }

    case "gemini-models": {
      const handled = await handleGeminiModels(selectStreams);
      state.onMainScreenRestore?.();
      return handled;
    }

    case "claude-models": {
      const handled = await handleClaudeModels(selectStreams);
      state.onMainScreenRestore?.();
      return handled;
    }

    case "cache": {
      const sessionsDir = resolveSessionsDir(process.cwd());
      const sub = input.trim().split(/\s+/)[1]?.toLowerCase();

      if (sub === "clear") {
        const removed = await clearExpiredSessions(sessionsDir, CACHE_TTL_DAYS);
        output.write(
          colors.info(`\n만료된 세션 ${removed}개 삭제됨 (TTL ${CACHE_TTL_DAYS}일 기준)\n\n`),
        );
        return true;
      }

      if (sub === "disable") {
        state.onCacheDisableToggle?.(true);
        output.write(colors.warning("\n캐시 우회 활성화: 이 세션에서 캐시를 사용하지 않습니다.\n\n"));
        return true;
      }

      if (sub === "enable") {
        state.onCacheDisableToggle?.(false);
        output.write(colors.success("\n캐시 활성화: 이 세션에서 캐시를 사용합니다.\n\n"));
        return true;
      }

      // stats (default)
      const stats = await getCacheStats(sessionsDir, CACHE_TTL_DAYS);
      output.write("\n" + formatCacheStats(stats, state.cacheDisabled ?? false) + "\n");
      return true;
    }

    case "logout": {
      return await handleLogout(adapter);
    }

    case "login": {
      const handled = runAdapterAuthLogin(adapter, selectStreams);
      state.onMainScreenRestore?.();
      return handled;
    }

    case "exit":
      await state.onExit();
      return true;

    default:
      return false;
  }
};

export const handleCodexModels = async (streams?: SelectWithArrowsStreams): Promise<boolean> => {
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

export const handleGeminiModels = async (streams?: SelectWithArrowsStreams): Promise<boolean> => {
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

export const handleClaudeModels = async (streams?: SelectWithArrowsStreams): Promise<boolean> => {
  const models = getClaudeAvailableModels();

  if (models.length === 0) {
    output.write(colors.warning("\n모델을 불러올 수 없습니다.\n\n"));
    return true;
  }

  const options = models.map((m) => ({
    value: m.slug,
    label: `${m.slug} — ${m.display_name}`,
  }));

  const selected = await selectWithArrows(options, "Claude 모델 선택", streams);

  if (selected) {
    process.env.ADAPTER_MODEL = selected;
    updateAdapterModel("claude", selected);
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
    invalidateCache("adapter-status", adapter);
    invalidateCache("adapter-config", adapter);
    invalidateCache("adapter-models", adapter);
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

const getModelAssetStatus = (model: TranslationModel) => {
  return inspectLocalModelFile(getDetoksModelFilePath(model));
};

const applySelectedModel = async (selectedModel: TranslationModel): Promise<void> => {
  const fileStatus = getModelAssetStatus(selectedModel);

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
    await downloadModel(selectedModel);
  }

  process.env.LOCAL_LLM_MODEL_NAME = selectedModel.modelName;
  process.env.LOCAL_LLM_MODEL_DIR = getDetoksModelDir(selectedModel);
  process.env.LOCAL_LLM_MODEL_PATH = getDetoksModelFilePath(selectedModel);
  process.env.LOCAL_LLM_HF_REPO = `${selectedModel.hfRepo}:${selectedModel.quantization}`;
  process.env.LOCAL_LLM_HF_FILE = selectedModel.hfFile;

  updateEnvFile(selectedModel, process.cwd());
  updateTranslationModel(selectedModel.modelName);

  output.write(
    colors.success(
      `\n✓ 번역 모델이 '${selectedModel.displayName}'로 변경되었습니다.\n`,
    ),
  );
  output.write(colors.muted(`  설정 저장됨: ~/.detoks/settings.json\n\n`));
};

const runCustomModelFlow = async (streams?: SelectWithArrowsStreams): Promise<boolean> => {
  const repoInput = await promptLine(
    "HuggingFace 레포를 입력하세요 (owner/repo 또는 전체 URL)",
    {
      placeholder: "unsloth/Qwen3-14B-GGUF",
      validate: (value) => {
        if (!parseHfRepoInput(value)) {
          return "올바른 형식으로 입력하세요 (예: owner/repo 또는 https://huggingface.co/owner/repo)";
        }
        return null;
      },
    },
  );

  if (!repoInput) {
    return true;
  }

  const ref = parseHfRepoInput(repoInput);
  if (!ref) {
    return true;
  }

  output.write(colors.muted("\n레포 확인 중...\n"));

  let ggufFiles;
  try {
    ggufFiles = await listGgufFiles(ref);
  } catch (err) {
    const msg = err instanceof HfRepoError ? err.message : String(err);
    output.write(colors.error(`\n✗ ${msg}\n\n`));
    return true;
  }

  output.write(
    colors.success(`✓ 레포에서 GGUF 파일 ${ggufFiles.length}개를 찾았습니다.\n\n`),
  );

  const quantOptions = ggufFiles.map((f) => {
    const quant = f.quantization === "unknown" ? f.filename : f.quantization;
    const size = f.sizeMb > 0 ? `${f.sizeMb}MB` : "크기 미상";
    return {
      value: f.filename,
      label: `${quant}  (${f.filename}, ${size})`,
    };
  });

  const selectedFile = await selectWithArrows(quantOptions, "양자화 선택", streams);

  if (!selectedFile) {
    return true;
  }

  const selectedInfo = ggufFiles.find((f) => f.filename === selectedFile);
  if (!selectedInfo) {
    return true;
  }

  const customModel = buildCustomTranslationModel({
    hfRepo: ref.fullRepo,
    hfFile: selectedInfo.filename,
    quantization: selectedInfo.quantization,
    sizeMb: selectedInfo.sizeMb,
  });

  try {
    await applySelectedModel(customModel);
  } catch {
    output.write(colors.error(`\n✗ 다운로드 실패. 인터넷 연결을 확인하고 다시 시도하세요.\n\n`));
    return true;
  }

  saveCustomModel({
    hfRepo: customModel.hfRepo,
    hfFile: customModel.hfFile,
    quantization: customModel.quantization,
    sizeMb: customModel.sizeMb,
    savedAt: new Date().toISOString(),
  });

  return true;
};

const handleTranslationModel = async (streams?: SelectWithArrowsStreams): Promise<boolean> => {
  output.write(`\n${colors.title("한글→영어 번역 모델 선택\n")}`);

  const builtinOptions = TRANSLATION_MODELS.map((model) => {
    const fileStatus = getModelAssetStatus(model);
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

  for (const opt of builtinOptions) {
    output.write(`${colors.muted(opt.label)}\n`);
    output.write(`   ${colors.muted(opt.model.description)}\n\n`);
  }

  output.write(colors.muted("손상된 모델은 선택 후 Enter를 누르면 재설치됩니다.\n\n"));

  // 메뉴 옵션: 빌트인 3개 + 사용자 지정 + 최근 사용자 지정(있을 때만)
  const menuOptions: SelectOption[] = builtinOptions.map((opt) => ({
    value: opt.value,
    label: opt.label,
  }));

  menuOptions.push({
    value: CUSTOM_MODEL_MENU_VALUE,
    label: "사용자 지정 모델 설정 (GGUF)",
  });

  const lastCustom = loadLastCustomModel();
  if (lastCustom) {
    const tempModel = buildCustomTranslationModel(lastCustom);
    const fileStatus = getModelAssetStatus(tempModel);
    const statusLabel =
      fileStatus.kind === "ready"
        ? ` ${colors.success("[설치됨]")}`
        : fileStatus.kind === "invalid"
          ? ` ${colors.warning("[손상됨]")}`
          : "";
    menuOptions.push({
      value: CUSTOM_MODEL_RECENT_VALUE,
      label: `이전 사용자 지정: ${lastCustom.hfRepo}:${lastCustom.quantization}${statusLabel}`,
    });
  }

  const selectedId = await selectWithArrows(menuOptions, "모델 선택", streams);

  if (!selectedId) {
    return true;
  }

  if (selectedId === CUSTOM_MODEL_MENU_VALUE) {
    return runCustomModelFlow(streams);
  }

  if (selectedId === CUSTOM_MODEL_RECENT_VALUE && lastCustom) {
    const recentModel = buildCustomTranslationModel(lastCustom);
    try {
      await applySelectedModel(recentModel);
    } catch {
      output.write(colors.error(`\n✗ 다운로드 실패. 인터넷 연결을 확인하고 다시 시도하세요.\n\n`));
    }
    return true;
  }

  const selectedModel = TRANSLATION_MODELS.find((m) => m.id === selectedId);
  if (!selectedModel) {
    output.write(colors.error("\n✗ 모델을 찾을 수 없습니다.\n\n"));
    return true;
  }

  try {
    await applySelectedModel(selectedModel);
  } catch {
    output.write(colors.error(`\n✗ 다운로드 실패. 인터넷 연결을 확인하고 다시 시도하세요.\n\n`));
  }

  return true;
};

export const handleAdapterSwitch = async (
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

  if (!runAdapterAuthLogin(newAdapter, streams)) {
    return true;
  }

  await onAdapterChange(newAdapter);

  if (newAdapter === "codex") {
    await handleCodexModels(streams);
  } else if (newAdapter === "gemini") {
    await handleGeminiModels(streams);
  } else if (newAdapter === "claude") {
    await handleClaudeModels(streams);
  } else {
    const adapterLabel = String(newAdapter).toUpperCase();
    output.write(
      colors.success(
        `\n✓ 어댑터가 '${adapterLabel}'로 설정되었습니다.\n\n`,
      ),
    );
  }

  return true;
};
