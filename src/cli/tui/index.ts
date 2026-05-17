import { stdout, stdin } from "node:process";
import { StringDecoder } from "node:string_decoder";
import type { CliArgs } from "../types.js";
import { createScreenManager } from "./screen-manager.js";
import {
  buildFooterText,
  renderScreenBorder,
  renderInputArea,
  renderFocusArea,
  renderFooter,
  measureInputLayout,
  type InputLayout,
  padDisplayWidth,
  wrapTextToDisplayWidth,
} from "./renderer.js";
import { playTuiEntryBootAnimation } from "../interactive/prompt-animation.js";
import { runModelSetupIfNeeded } from "../model-setup/index.js";
import {
  handleAdapterSwitch,
  handleSlashCommand,
} from "../repl-commands/index.js";
import {
  getNextSlashAutocompleteIndex,
  getSlashAutocompleteCommands,
  getSlashAutocompleteQuery,
  getSlashAutocompleteSelection,
} from "./slash-autocomplete.js";
import { PipelineStatusPanel } from "./panels/pipeline-status.js";
import { TranscriptPanel } from "./panels/transcript.js";
import { ResultSummaryPanel } from "./panels/result-summary.js";
import { EmbeddedTerminalPane } from "./panels/embedded-terminal.js";
import { renderSlashAutocompletePanel } from "./panels/slash-autocomplete.js";
import { TuiEventRouter } from "./event-router.js";
import {
  formatTranscript,
  isAutoSaveEnabled,
  resolveTranscriptPath,
  saveTranscript,
} from "./transcript-export.js";
import {
  InputHistory,
  loadHistoryFromDisk,
  resolveHistoryPath,
  saveHistoryToDisk,
} from "./input-history.js";
import {
  backspaceAt,
  deleteAt,
  insertAt,
  moveCursorEnd,
  moveCursorHome,
  moveCursorLeft,
  moveCursorRight,
  setInput,
} from "./input-cursor.js";
import {
  computeShiftedOverrides,
  getEffectiveWeights,
  isEmptyOverrides,
  loadLayoutOverrides,
  parseLayoutCommand,
  resolveLayoutOverridesPath,
  saveLayoutOverrides,
  type RuntimeLayoutOverrides,
} from "./runtime-layout.js";
import {
  createEmbeddedTerminalFocusManager,
  isEmbeddedTerminalInterruptKey,
  isEmbeddedTerminalNativeFocusToggleKey,
  isEmbeddedTerminalReturnToDetoksKey,
  isTerminalFocusInSequence,
  isTerminalFocusOutSequence,
} from "./focus-manager.js";
import {
  createEmbeddedNativeCliSession,
  type EmbeddedNativeCliSession,
} from "./native-cli-session.js";
import { formatEmbeddedTerminalFocusHint } from "./embedded-terminal.js";
import { buildExecutionApprovalLines } from "./approval-prompt.js";
import {
  formatViewportTrackingHint,
} from "./content-viewport.js";
import { consumeMouseReportingInput } from "./mouse-reporting.js";
import {
  captureWorkspaceSnapshot,
  diffWorkspaceSnapshots,
} from "./workspace-diff.js";
import { toNormalizedRequest } from "../parse.js";
import { orchestratePipeline } from "../../core/pipeline/orchestrator.js";
import { buildActionTimeline } from "../../core/timeline/action-timeline.js";
import { readRole1ModelName, loadRole1RuntimeConfig } from "../../core/prompt/config.js";
import { ensureLocalLlmRuntime } from "../../core/llm-client/local-runtime.js";
import { onLlamaBuildPhase } from "../../core/llm-client/llama-build-events.js";
import type { TokenReductionSnapshot } from "../../core/utils/tokenMetrics.js";
import { statusColor } from "./design/tokens.js";
import { formatError } from "../format.js";
import {
  hasConfigFile,
  getAdapterModel,
  getCodexReasoningEffortOverride,
  getTranslationModel,
  updateSelectedAdapter,
} from "../config/config-manager.js";
import { loadAndApplyConfig } from "../config/loader.js";
import type { PipelineProgressEvent } from "../../core/pipeline/types.js";
import type { PtySessionController } from "../../integrations/subprocess/types.js";

interface TuiRunOptions {
  adapter: CliArgs["adapter"];
  executionMode: CliArgs["executionMode"];
  verbose: boolean;
  cwd?: string;
  sessionId?: string;
  translationModel?: string;
  adapterModel?: string;
  inferenceStrength?: string;
  presentationMode?: CliArgs["presentationMode"];
}

type RunBlockStatus = "pending-approval" | "running" | "completed" | "failed" | "cancelled";

interface TuiRunBlock {
  id: string;
  index: number;
  prompt: string;
  status: RunBlockStatus;
  createdAt: number;
  completedAt?: number | undefined;
  pane: EmbeddedTerminalPane;
  summaryLines: string[];
}

interface StickyPromptState {
  runId: string;
  prompt: string;
  status: RunBlockStatus;
}

const truncateToDisplayWidth = (text: string, width: number): string => {
  if (width <= 0) {
    return "";
  }

  const [firstLine = ""] = wrapTextToDisplayWidth(text, width);
  return firstLine;
};

const formatTokenSavingsBadge = (reduction?: TokenReductionSnapshot | null): string | undefined => {
  if (!reduction) {
    return undefined;
  }

  const percent = Math.max(0, Math.round(reduction.savedPercent));
  return `tok -${percent}%`;
};

const formatCacheHitBadge = (cacheHit: import("../../core/pipeline/types.js").CacheHitInfo): string => {
  const ageDays = Math.round(cacheHit.cacheAge / (24 * 60 * 60 * 1000));
  const ageLabel = ageDays === 0 ? "오늘" : `${ageDays}일 전`;
  const kindLabel = cacheHit.kind === "session" ? "세션" : "task";
  return `cache hit(${kindLabel} · ${ageLabel})`;
};

export const runTuiRepl = async (options: TuiRunOptions): Promise<void> => {
  const screen = createScreenManager(stdout, stdin);
  const decoder = new StringDecoder("utf8");
  const executionCwd = options.cwd ?? process.cwd();
  const state = {
    adapter: options.adapter,
    adapterModel: options.adapterModel ?? getAdapterModel(options.adapter),
    translationModel: options.translationModel ?? getTranslationModel(),
    verbose: options.verbose,
    cacheDisabled: false,
    inferenceStrength: options.adapter === "codex"
      ? options.inferenceStrength ?? getCodexReasoningEffortOverride() ?? "medium"
      : undefined as string | undefined,
    tokenSavingsLabel: undefined as string | undefined,
  };
  const nativePassthroughMode = options.presentationMode === "passthrough";
  const embeddedPaneMode = options.presentationMode === "embedded-pane";

  const enterTuiDisplay = (): void => {
    screen.enterAltScreen();
    screen.setRawMode(true);
    screen.cursorHide();
    // Enable bracketed paste mode so pasted content doesn't auto-submit
    stdout.write("\x1b[?2004h");
    // Enable terminal focus reporting so we can repaint after app switch/resume.
    stdout.write("\x1b[?1004h");
    // Enable mouse wheel reporting in SGR mode for trackpad/mouse viewport scrolling.
    stdout.write("\x1b[?1000h");
    stdout.write("\x1b[?1006h");
  };

  const leaveTuiDisplay = (): void => {
    stdout.write("\x1b[?2004l");
    stdout.write("\x1b[?1004l");
    stdout.write("\x1b[?1000l");
    stdout.write("\x1b[?1006l");
    screen.setRawMode(false);
    screen.cursorShow();
    screen.exitAltScreen();
  };

  const refreshRuntimeState = (): void => {
    state.adapterModel = getAdapterModel(state.adapter);
    state.translationModel = getTranslationModel();
    state.inferenceStrength =
      state.adapter === "codex"
        ? getCodexReasoningEffortOverride() ?? "medium"
        : undefined;
  };

  // Initialize TUI
  enterTuiDisplay();

  const sigtermHandler = (): void => {
    stdout.write("\x1b[?2004l");
    stdout.write("\x1b[?1000l");
    stdout.write("\x1b[?1006l");
    screen.cleanup();
    process.exit(0);
  };
  process.once("SIGTERM", sigtermHandler);

  try {
    if (stdout.isTTY) {
      await playTuiEntryBootAnimation(stdout);
    }

    const hasInitialConfig = hasConfigFile();
    const hasRole1Model = Boolean(
      readRole1ModelName({ cwd: executionCwd }),
    );

    if (!hasInitialConfig || !hasRole1Model) {
      leaveTuiDisplay();
      await runModelSetupIfNeeded(executionCwd);
      refreshRuntimeState();

      if (!hasInitialConfig) {
        await handleAdapterSwitch(state.adapter, async (newAdapter) => {
          state.adapter = newAdapter;
          loadAndApplyConfig(newAdapter);
          updateSelectedAdapter(newAdapter);
          refreshRuntimeState();
        });
        refreshRuntimeState();
      }

      enterTuiDisplay();
    }

    // Warm up local LLM runtime eagerly so the first prompt doesn't stall.
    if (options.executionMode === "real") {
      const warmupConfig = loadRole1RuntimeConfig({ cwd: executionCwd });
      if (warmupConfig.localLlmAutoStart !== false) {
        ensureLocalLlmRuntime(warmupConfig).catch(() => {
          // Error will surface when the first prompt tries to use the runtime.
        });
      }
    }

    let input = "";
    // P3-3 2단계: code-point index of cursor in `input`. 0 ≤ cursor ≤ input length.
    let cursor = 0;
    let running = true;
    let isExecuting = false;

    // Initialize panels
    const pipelinePanel = new PipelineStatusPanel();
    const transcriptPanel = new TranscriptPanel();
    const resultPanel = new ResultSummaryPanel();
    resultPanel.setVerbose(state.verbose);

    const dirtyPanels = { pipeline: true, transcript: true, result: true };
    const markAllDirty = (): void => {
      dirtyPanels.pipeline = true;
      dirtyPanels.transcript = true;
      dirtyPanels.result = true;
    };

    // P3-3: Input history — load existing on init, persist on each submit.
    const inputHistory = new InputHistory();
    const historyPath = resolveHistoryPath(executionCwd);
    void loadHistoryFromDisk(historyPath)
      .then((entries) => inputHistory.load(entries))
      .catch(() => undefined);

    // P3-1: Runtime layout overrides — load applied below after render() is defined.
    let layoutOverrides: RuntimeLayoutOverrides = {};
    const layoutOverridesPath = resolveLayoutOverridesPath(executionCwd);
    const getTranscriptRatio = (): number => {
      const { transcriptWeight, resultWeight } = getEffectiveWeights(layoutOverrides);
      const total = transcriptWeight + resultWeight;
      return total > 0 ? transcriptWeight / total : 0.7;
    };
    let embeddedTerminalPane = new EmbeddedTerminalPane();
    const eventRouter = new TuiEventRouter({
      pipelinePanel,
      transcriptPanel,
      getEmbeddedTerminalPane: () => embeddedTerminalPane,
    });
    const embeddedTerminalFocus = createEmbeddedTerminalFocusManager();
    let hasExecuted = false;
    let lastInputSeparatorRow = -1;
    let slashAutocompleteSelectedIndex = 0;
    let isInputSuspended = false;
    let isPasting = false;
    let embeddedNativeCliSession: EmbeddedNativeCliSession | null = null;
    let activeAdapterController: PtySessionController | null = null;
    let pendingNativeEscapeReturn = false;
    let pendingNativeEscapeTimer: NodeJS.Timeout | undefined;
    let executionClockStartedAt: number | null = null;
    let executionClockTimer: NodeJS.Timeout | undefined;
    let forceFullRender = false;
    let scheduledRenderTimer: NodeJS.Timeout | undefined;
    let scheduledRenderReason: string | undefined;
    let lastEmbeddedNativeResize: { columns: number; rows: number } | null = null;
    let renderPerfWindowStartedAt = Date.now();
    let renderPerfCount = 0;
    let coalescedRenderCount = 0;
    let ptyEventPerfCount = 0;
    let render: () => void = () => {};
    let localLlmBuildHint: string | null = null;
    let buildSpinnerTimer: NodeJS.Timeout | undefined;
    let buildSpinnerFrame = 0;
    const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
    let pendingApprovalPrompt: string | null = null;
    let skipApprovalLineFeed = false;
    let pendingMouseInputSequence = "";
    let runBlocks: TuiRunBlock[] = [];
    let activeRunBlock: TuiRunBlock | null = null;
    let stickyPrompt: StickyPromptState | null = null;

    const getStickyPromptText = (): string | null => stickyPrompt?.prompt ?? pendingApprovalPrompt;

    const getStickyPromptStatus = (): string => {
      if (stickyPrompt !== null) {
        switch (stickyPrompt.status) {
          case "pending-approval":
            return "실행 확인 대기 · Enter 실행 · Esc 편집 복귀";
          case "running":
            return "실행 중";
          case "completed":
            return "완료";
          case "failed":
            return "실패";
          case "cancelled":
            return "취소됨";
        }
      }

      if (pendingApprovalPrompt !== null) {
        return "실행 확인 대기 · Enter 실행 · Esc 편집 복귀";
      }

      return hasExecuted ? "최근 실행 완료" : "첫 프롬프트를 입력하세요";
    };

    const getEmbeddedStickyRows = (): number => 4;
    const getEmbeddedActivityRows = (): number => 1;
    const getEmbeddedFixedRows = (): number => getEmbeddedStickyRows() + getEmbeddedActivityRows();

    const setStickyPromptFromRun = (run: TuiRunBlock): void => {
      stickyPrompt = {
        runId: run.id,
        prompt: run.prompt,
        status: run.status,
      };
    };

    const createRunBlock = (prompt: string): TuiRunBlock => {
      const index = runBlocks.length + 1;
      return {
        id: `run-${Date.now()}-${index}`,
        index,
        prompt,
        status: "running",
        createdAt: Date.now(),
        pane: new EmbeddedTerminalPane(),
        summaryLines: [],
      };
    };

    const registerRunBlock = (prompt: string, status: RunBlockStatus): TuiRunBlock => {
      const block = createRunBlock(prompt);
      block.status = status;
      runBlocks.push(block);
      activeRunBlock = block;
      embeddedTerminalPane = block.pane;
      setStickyPromptFromRun(block);
      return block;
    };

    const updateActiveRunBlockStatus = (status: RunBlockStatus): void => {
      if (activeRunBlock === null) {
        return;
      }

      activeRunBlock.status = status;
      if (status === "running") {
        activeRunBlock.completedAt = undefined;
      } else {
        activeRunBlock.completedAt = Date.now();
      }
      setStickyPromptFromRun(activeRunBlock);
    };

    const markActiveRunCancelled = (): void => {
      if (activeRunBlock === null) {
        return;
      }

      activeRunBlock.status = "cancelled";
      activeRunBlock.completedAt = Date.now();
      activeRunBlock.summaryLines = ["실행이 취소되었습니다."];
      activeRunBlock.pane.appendFinalAnswer("\n실행이 취소되었습니다.\n");
      setStickyPromptFromRun(activeRunBlock);
    };

    const buildSectionDivider = (label: string, width: number): string => {
      if (width <= 0) {
        return "";
      }

      const prefix = `── ${label} `;
      return statusColor.header(padDisplayWidth(
        prefix.length >= width ? prefix.slice(0, width) : `${prefix}${"─".repeat(width - prefix.length)}`,
        width,
      ));
    };

    const buildWrappedBlock = (lines: string[], width: number, prefix = ""): string[] => {
      if (width <= 0) {
        return [];
      }

      const contentWidth = Math.max(1, width - prefix.length);
      const wrapped: string[] = [];
      for (const line of lines) {
        const segments = wrapTextToDisplayWidth(line, contentWidth);
        for (const segment of segments) {
          wrapped.push(padDisplayWidth(`${prefix}${segment}`, width));
        }
      }
      return wrapped;
    };

    const buildStickyPromptLines = (width: number): string[] => {
      if (width <= 0) {
        return [];
      }

      const promptText = getStickyPromptText();
      const statusText = getStickyPromptStatus();
      const lines: string[] = [];

      if (promptText === null) {
        lines.push(buildSectionDivider("Sticky Prompt", width));
        lines.push(
          ...buildWrappedBlock(
            [hasExecuted ? "최근 실행 결과를 준비하는 중입니다." : "첫 프롬프트를 입력하세요."],
            width,
          ).map((line) => statusColor.muted(line)),
        );
        lines.push(statusColor.muted(padDisplayWidth(`상태: ${statusText}`, width)));
        lines.push(" ".repeat(width));
        return lines.slice(0, getEmbeddedStickyRows());
      }

      lines.push(buildSectionDivider("Sticky Prompt", width));
      lines.push(
        ...buildWrappedBlock(promptText.split("\n"), width, "> ").slice(0, Math.max(0, getEmbeddedStickyRows() - 2)),
      );
      lines.push(statusColor.muted(padDisplayWidth(`상태: ${statusText}`, width)));
      lines.push(" ".repeat(width));
      return lines.slice(0, getEmbeddedStickyRows());
    };

    const buildEmbeddedActivityLines = (
      width: number,
      inputLayout: InputLayout,
      viewportStatusText: string | null,
    ): string[] => {
      if (width <= 0) {
        return [];
      }

      const interactionState =
        activeRunBlock?.status === "running" ? activeRunBlock.pane.getInteractionState(width) : null;
      const viewportStatusSuffix =
        viewportStatusText !== null &&
        (viewportStatusText !== "최신 따라가기 ON" || inputLayout.hiddenLineCount > 0)
          ? ` · ${viewportStatusText}`
          : "";
      if (interactionState?.kind === "approval") {
        const approvalLine = truncateToDisplayWidth(
          `현재 활동: ${interactionState.label} · ${interactionState.detail ?? "승인 대기 중"} · 진행 중${viewportStatusSuffix}`,
          width,
        );
        return [
          statusColor.warn(padDisplayWidth(approvalLine, width)),
        ].slice(0, getEmbeddedActivityRows());
      }

      const activity = activeRunBlock?.pane.getActivitySnapshot(width);
      if (activity === null || activity === undefined) {
        if (inputLayout.hiddenLineCount > 0) {
          const inputHint = truncateToDisplayWidth(
            `현재 입력: 붙여넣기 중 · 위 ${inputLayout.hiddenLineCount}줄 숨김 · Enter 실행`,
            width,
          );
          return [
            statusColor.muted(padDisplayWidth(inputHint, width)),
          ].slice(0, getEmbeddedActivityRows());
        }

        return [
          statusColor.muted(
            padDisplayWidth(
              truncateToDisplayWidth(
                viewportStatusText !== null
                  ? `현재 활동: 대기 · ${viewportStatusText}`
                  : "현재 활동: 대기",
                width,
              ),
              width,
            ),
          ),
        ].slice(0, getEmbeddedActivityRows());
      }

      const statusLabel =
        activity.status === "running" ? "진행 중" : activity.status === "completed" ? "완료" : "실패";
      const compactLine = truncateToDisplayWidth(
        `현재 활동: ${activity.label} · ${activity.detail} · ${statusLabel}${viewportStatusSuffix}`,
        width,
      );
      const runningLine = activity.status === "running"
        ? truncateToDisplayWidth(`${compactLine} · Ctrl+C 중단`, width)
        : compactLine;
      return [
        activity.status === "failed"
          ? statusColor.error(padDisplayWidth(compactLine, width))
          : statusColor.muted(padDisplayWidth(runningLine, width)),
      ].slice(0, getEmbeddedActivityRows());
    };

    const buildRunSummaryLines = (run: TuiRunBlock, width: number): string[] => {
      if (run.status === "pending-approval") {
        return buildExecutionApprovalLines(width).map((line) => line);
      }

      if (run.status === "running" && activeRunBlock?.id === run.id) {
        const currentSummary = resultPanel.getLines();
        if (currentSummary.length > 0) {
          return currentSummary;
        }
      }

      if (run.summaryLines.length > 0) {
        return run.summaryLines;
      }

      if (run.status === "cancelled") {
        return ["실행이 취소되었습니다."];
      }

      if (run.status === "failed") {
        return ["실행이 실패했습니다."];
      }

      if (run.status === "running") {
        return ["", "  Waiting for adapter CLI to finish…"];
      }

      return ["실행 결과가 아직 없습니다."];
    };

    const buildRunBlockLines = (run: TuiRunBlock, width: number): string[] => {
      if (width <= 0) {
        return [];
      }

      const lines: string[] = [];
      lines.push(buildSectionDivider(`Run #${run.index}`, width));
      lines.push(statusColor.muted(padDisplayWidth(`상태: ${getStickyPromptStatusForRun(run)}`, width)));
      lines.push(buildSectionDivider(`Prompt #${run.index}`, width));
      lines.push(...buildWrappedBlock(run.prompt.split("\n"), width, "> "));
      lines.push(buildSectionDivider(`Original CLI #${run.index}`, width));

      if (run.status === "pending-approval") {
        lines.push(
          ...buildWrappedBlock(
            ["실행 확인 대기 중 · Enter로 실행 · Esc로 편집 복귀"],
            width,
          ).map((line) => statusColor.muted(line)),
        );
      } else {
        const cliLines = run.pane.getRenderableLines(width).map((line) => line.text);
        lines.push(...cliLines);
      }

      lines.push(buildSectionDivider(`Summary #${run.index}`, width));
      const summaryLines = buildRunSummaryLines(run, width);
      if (summaryLines.length > 0) {
        lines.push(...buildWrappedBlock(summaryLines, width));
      }
      lines.push(" ".repeat(width));
      return lines;
    };

    const getStickyPromptStatusForRun = (run: TuiRunBlock): string => {
      switch (run.status) {
        case "pending-approval":
          return "실행 확인 대기";
        case "running":
          return "실행 중";
        case "completed":
          return "완료";
        case "failed":
          return "실패";
        case "cancelled":
          return "취소됨";
      }
    };

    const buildScrollableContentLines = (width: number): string[] => {
      if (width <= 0) {
        return [];
      }

      if (runBlocks.length === 0) {
        return buildWrappedBlock(
          [
            "실행 히스토리가 아직 없습니다.",
            "프롬프트를 실행하면 여기 아래에 RunBlock이 누적됩니다.",
          ],
          width,
        ).map((line) => statusColor.muted(line));
      }

      const lines: string[] = [];
      for (const run of runBlocks) {
        lines.push(...buildRunBlockLines(run, width));
      }

      return lines;
    };

    const getEmbeddedTranscriptHeight = (inputLayout: InputLayout): number => {
      const bannerRows = Math.min(3, Math.max(0, inputLayout.separatorRow));
      const statusRegionStart = bannerRows;
      const statusRegionEnd = Math.min(inputLayout.separatorRow, statusRegionStart + 8);
      const contentRegionStart = statusRegionEnd;
      const stickyRows = embeddedPaneMode ? getEmbeddedFixedRows() : 0;
      const stickyRegionStart = contentRegionStart;
      const stickyRegionEnd = Math.min(inputLayout.separatorRow, stickyRegionStart + stickyRows);
      return Math.max(0, inputLayout.separatorRow - stickyRegionEnd);
    };

    const getEmbeddedViewportStatusText = (width: number, inputLayout: InputLayout): string | null => {
      if (!embeddedPaneMode) {
        return null;
      }

      const transcriptHeight = getEmbeddedTranscriptHeight(inputLayout);
      if (transcriptHeight <= 0) {
        return null;
      }

      const tracking = embeddedTerminalPane.getViewportTrackingInfo(width, transcriptHeight);
      return formatViewportTrackingHint(
        tracking.totalLines,
        transcriptHeight,
        {
          pinnedToBottom: tracking.pinnedToBottom,
          topRow: Math.max(0, tracking.totalLines - transcriptHeight - tracking.distanceFromBottom),
        },
      );
    };

    const scrollEmbeddedViewportBy = (deltaRows: number): void => {
      embeddedTerminalPane.scrollBy(deltaRows);
    };

    const applyMouseWheelEvents = (
      text: string,
    ): { cleanedText: string; handledWheel: boolean } => {
      const consumption = consumeMouseReportingInput(`${pendingMouseInputSequence}${text}`);
      pendingMouseInputSequence = consumption.pendingSequence;

      if (
        embeddedPaneMode &&
        embeddedTerminalFocus.focus !== "adapter-terminal" &&
        consumption.wheelEvents.length > 0
      ) {
        for (const wheelEvent of consumption.wheelEvents) {
          scrollEmbeddedViewportBy(wheelEvent.direction === "up" ? -3 : 3);
        }
        render();
      }

      return {
        cleanedText: consumption.cleanedText,
        handledWheel: consumption.wheelEvents.length > 0,
      };
    };

    const clearNativeEscapeTimer = (): void => {
      if (pendingNativeEscapeTimer !== undefined) {
        clearTimeout(pendingNativeEscapeTimer);
        pendingNativeEscapeTimer = undefined;
      }
      pendingNativeEscapeReturn = false;
    };

    const closeEmbeddedNativeCliSession = (signal?: NodeJS.Signals): void => {
      clearNativeEscapeTimer();
      if (signal !== undefined) {
        embeddedNativeCliSession?.kill(signal);
      } else {
        embeddedNativeCliSession?.close();
      }
      embeddedNativeCliSession = null;
      lastEmbeddedNativeResize = null;
    };

    const closeActiveAdapterController = (signal?: NodeJS.Signals): void => {
      if (signal !== undefined) {
        activeAdapterController?.kill(signal);
      } else {
        activeAdapterController?.close();
      }
      activeAdapterController = null;
    };

    const closeExecutionControllers = (signal?: NodeJS.Signals): void => {
      closeEmbeddedNativeCliSession(signal);
      closeActiveAdapterController(signal);
    };

    const clearExecutionClock = (): void => {
      if (executionClockTimer !== undefined) {
        clearInterval(executionClockTimer);
        executionClockTimer = undefined;
      }
      executionClockStartedAt = null;
      pipelinePanel.setExecutionClock(null);
    };

    const requestFullRender = (): void => {
      forceFullRender = true;
    };

    const maybeFocusEmbeddedInteraction = (): boolean => {
      if (!embeddedPaneMode) {
        return false;
      }

      const interactionState = embeddedTerminalPane.getInteractionState();
      if (
        interactionState?.kind === "approval" &&
        embeddedTerminalFocus.focus !== "adapter-terminal"
      ) {
        embeddedTerminalFocus.focusNative();
        return true;
      }

      return false;
    };

    const emitRenderPerfIfNeeded = (): void => {
      if (process.env.DETOKS_TUI_PERF !== "1") {
        return;
      }

      const now = Date.now();
      const elapsed = now - renderPerfWindowStartedAt;
      if (elapsed < 1000) {
        return;
      }

      process.stderr.write(
        `[detoks:tui-perf] render=${renderPerfCount}/s pty=${ptyEventPerfCount}/s coalesced=${coalescedRenderCount}/s reason=${scheduledRenderReason ?? "none"}\n`,
      );
      renderPerfWindowStartedAt = now;
      renderPerfCount = 0;
      coalescedRenderCount = 0;
      ptyEventPerfCount = 0;
    };

    const renderNow = (_reason: string): void => {
      if (scheduledRenderTimer !== undefined) {
        clearTimeout(scheduledRenderTimer);
        scheduledRenderTimer = undefined;
      }
      render();
      renderPerfCount += 1;
      emitRenderPerfIfNeeded();
    };

    const requestRender = (reason: string): void => {
      scheduledRenderReason = reason;
      if (!embeddedPaneMode) {
        renderNow(reason);
        return;
      }

      if (scheduledRenderTimer !== undefined) {
        coalescedRenderCount += 1;
        return;
      }

      scheduledRenderTimer = setTimeout(() => {
        scheduledRenderTimer = undefined;
        maybeFocusEmbeddedInteraction();
        render();
        renderPerfCount += 1;
        emitRenderPerfIfNeeded();
      }, 16);
    };

    const startExecutionClock = (): void => {
      if (!embeddedPaneMode || executionClockStartedAt !== null) {
        return;
      }

      executionClockStartedAt = Date.now();
      pipelinePanel.setExecutionClock(executionClockStartedAt);
      executionClockTimer = setInterval(() => {
        if (isExecuting) {
          requestRender("execution-clock");
        }
      }, 250);
    };

    const ensureEmbeddedNativeCliSession = (): void => {
      if (!embeddedPaneMode || embeddedNativeCliSession !== null || options.executionMode !== "real") {
        return;
      }

      embeddedNativeCliSession = createEmbeddedNativeCliSession({
        adapter: state.adapter,
        cwd: executionCwd,
        verbose: state.verbose,
        ...(state.adapterModel !== undefined ? { model: state.adapterModel } : {}),
        ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
        onEvent: (event) => {
          eventRouter.routeAdapterEvent(event, "embedded");
          if (event.type === "chunk") {
            ptyEventPerfCount += 1;
          }
          requestRender("embedded-native-event");
        },
      });
    };

    const suspendInput = (): void => {
      if (isInputSuspended) {
        return;
      }

      stdin.removeListener("data", onData);
      stdin.pause();
      isInputSuspended = true;
    };

    const resumeInput = (): void => {
      if (!isInputSuspended) {
        return;
      }

      stdin.resume();
      stdin.on("data", onData);
      isInputSuspended = false;
    };

    // Optimized: only update input area
    const renderInputOnly = (): void => {
      const dims = screen.getDimensions();
      const ctx = { screen, dims };
      const inputLayout = renderInputArea(ctx, input, cursor);
      lastInputSeparatorRow = inputLayout.separatorRow;
      screen.flush();
    };

    const renderBanner = (viewportStatusText: string | null, inputLayout: InputLayout): void => {
      const dims = screen.getDimensions();
      const inputOverflowHint =
        embeddedPaneMode && inputLayout.hiddenLineCount > 0
          ? `붙여넣기 입력 · 위 ${inputLayout.hiddenLineCount}줄 숨김 · Enter 실행`
          : null;
      const browsingHistoryHint =
        stickyPrompt?.status === "pending-approval" || pendingApprovalPrompt !== null
          ? "실행 대기 중 · Enter 실행 · Esc 편집 복귀"
          : inputOverflowHint ??
            localLlmBuildHint ??
            (embeddedPaneMode
              ? viewportStatusText ?? "첫 프롬프트를 입력하면 아래 패널이 채워집니다 · /... 자동완성 · q 종료"
              : "첫 프롬프트를 입력하면 아래 패널이 채워집니다 · /... 자동완성 · q 종료");
      const bannerLines = [
        `adapter: ${state.adapter} | model: ${state.adapterModel ?? "미설정"} | translate: ${state.translationModel ?? "미설정"}`,
        `mode: ${options.executionMode} | session: ${options.sessionId ?? "new"}`,
        browsingHistoryHint,
      ];

      for (const [index, line] of bannerLines.entries()) {
        if (index >= Math.min(3, dims.rows)) {
          break;
        }

        const displayLine = (line.length > dims.columns
          ? line.slice(0, Math.max(0, dims.columns - 3)) + "..."
          : line).padEnd(dims.columns);

        screen.cursorMoveTo(index, 0);
        screen.write(statusColor.muted(displayLine));
      }
    };

    const renderInteractiveInput = (): void => {
      const dims = screen.getDimensions();
      const ctx = { screen, dims };
      const inputLayout = measureInputLayout(dims, input, cursor);
      lastInputSeparatorRow = inputLayout.separatorRow;

      const slashAutocompleteQuery = getSlashAutocompleteQuery(input);
      const bannerRows = Math.min(3, Math.max(0, inputLayout.separatorRow));
      const statusRegionStart = bannerRows;
      const statusRegionEnd = Math.min(inputLayout.separatorRow, statusRegionStart + 8);
      const contentRegionStart = statusRegionEnd;
      const availableContentRows = Math.max(0, inputLayout.separatorRow - contentRegionStart);
      const transcriptRows = availableContentRows > 0 ? availableContentRows : 0;
      const transcriptRegionEnd = Math.min(
        inputLayout.separatorRow,
        contentRegionStart + transcriptRows,
      );
      const resultRegion = {
        startRow: transcriptRegionEnd,
        endRow: inputLayout.separatorRow,
        columns: dims.columns,
      };

      if (embeddedPaneMode && embeddedTerminalFocus.focus !== "detoks-input") {
        renderFocusArea(
          ctx,
          formatEmbeddedTerminalFocusHint(embeddedTerminalFocus.focus, state.adapter),
        );
      } else {
        renderInputArea(ctx, input, cursor);
      }

      if (slashAutocompleteQuery !== null) {
        renderSlashAutocompletePanel(
          ctx,
          resultRegion,
          slashAutocompleteQuery,
          getSlashAutocompleteCommands(state.adapter, slashAutocompleteQuery),
          slashAutocompleteSelectedIndex,
        );
      } else if (!embeddedPaneMode && dirtyPanels.result) {
        resultPanel.render(ctx, resultRegion);
        dirtyPanels.result = false;
      }

      renderFooter(
        ctx,
        buildFooterText(dims.columns, {
          adapter: state.adapter,
          adapterModel: state.adapterModel,
          inferenceStrength: state.inferenceStrength,
          tokenSavings: state.tokenSavingsLabel,
          cwd: executionCwd,
        }),
      );
      screen.flush();
    };

    render = (): void => {
      const dims = screen.getDimensions();
      const ctx = { screen, dims };
      if (forceFullRender) {
        screen.clear();
        screen.cursorMoveTo(0, 0);
        forceFullRender = false;
        markAllDirty();
      }
      const inputLayout = measureInputLayout(dims, input, cursor);
      const viewportStatusText = getEmbeddedViewportStatusText(dims.columns, inputLayout);
      const bannerRows = Math.min(3, Math.max(0, inputLayout.separatorRow));
      const statusRegionStart = bannerRows;
      const statusRegionEnd = Math.min(inputLayout.separatorRow, statusRegionStart + 8);
      const contentRegionStart = statusRegionEnd;
      const availableContentRows = Math.max(0, inputLayout.separatorRow - contentRegionStart);
      const transcriptRows =
        availableContentRows > 0
          ? Math.max(1, Math.floor(availableContentRows * getTranscriptRatio()))
          : 0;
      const transcriptRegionEnd = Math.min(
        inputLayout.separatorRow,
        contentRegionStart + transcriptRows,
      );
      const stickyRows = embeddedPaneMode ? getEmbeddedFixedRows() : 0;
      const stickyRegionStart = contentRegionStart;
      const stickyRegionEnd = Math.min(inputLayout.separatorRow, stickyRegionStart + stickyRows);

      // Render structure (minimal - no borders)
      renderScreenBorder(ctx);
      renderBanner(viewportStatusText, inputLayout);

      const statusRegion = {
        startRow: statusRegionStart,
        endRow: statusRegionEnd,
        columns: dims.columns,
      };
      if (dirtyPanels.pipeline) {
        pipelinePanel.render(ctx, statusRegion);
        dirtyPanels.pipeline = false;
      }

      if (embeddedPaneMode) {
        const stickyRegion = {
          startRow: stickyRegionStart,
          endRow: stickyRegionEnd,
          columns: dims.columns,
        };
        const now = Date.now();
        const approvalBanner = activeRunBlock?.pane.getStatusBannerLine(stickyRegion.columns, { now }) ?? null;
        const stickyLines = [
          ...(approvalBanner ? [approvalBanner.text] : []),
          ...buildStickyPromptLines(stickyRegion.columns),
          ...buildEmbeddedActivityLines(stickyRegion.columns, inputLayout, viewportStatusText),
        ];
        let stickyRow = stickyRegion.startRow;
        for (const line of stickyLines.slice(0, Math.max(0, stickyRegion.endRow - stickyRegion.startRow))) {
          if (stickyRow >= stickyRegion.endRow) {
            break;
          }
          screen.cursorMoveTo(stickyRow, 0);
          screen.write(line);
          stickyRow += 1;
        }
        while (stickyRow < stickyRegion.endRow) {
          screen.cursorMoveTo(stickyRow, 0);
          screen.write(" ".repeat(stickyRegion.columns));
          stickyRow += 1;
        }

        const transcriptRegion = {
          startRow: stickyRegionEnd,
          endRow: inputLayout.separatorRow,
          columns: dims.columns,
        };
        const transcriptPtyRows = Math.max(
          1,
          Math.ceil(Math.max(0, availableContentRows - stickyRows) * getTranscriptRatio()),
        );
        embeddedTerminalPane.resize(transcriptRegion.columns, transcriptPtyRows);
        if (embeddedNativeCliSession !== null) {
          if (
            lastEmbeddedNativeResize === null ||
            lastEmbeddedNativeResize.columns !== transcriptRegion.columns ||
            lastEmbeddedNativeResize.rows !== transcriptPtyRows
          ) {
            lastEmbeddedNativeResize = {
              columns: transcriptRegion.columns,
              rows: transcriptPtyRows,
            };
            embeddedNativeCliSession?.resize(transcriptRegion.columns, transcriptPtyRows);
          }
        }
        const transcriptHeight = transcriptRegion.endRow - transcriptRegion.startRow;
        const showFooter = transcriptHeight > 2;
        const paneRenderRegion = showFooter
          ? { ...transcriptRegion, endRow: transcriptRegion.endRow - 1 }
          : transcriptRegion;
        embeddedTerminalPane.render(ctx, paneRenderRegion, {
          now,
          runStartedAt: executionClockStartedAt,
        });

        if (showFooter) {
          const footerRow = transcriptRegion.endRow - 1;
          screen.cursorMoveTo(footerRow, 0);
          screen.write(embeddedTerminalPane.getFocusFooterLine(transcriptRegion.columns, embeddedTerminalFocus.focus));
        }

        const scrollIndicator = embeddedTerminalPane.getScrollIndicator(transcriptRegion.columns, transcriptHeight);
        if (scrollIndicator !== null) {
          const indicatorLen = scrollIndicator.length;
          const startCol = Math.max(0, transcriptRegion.columns - indicatorLen);
          screen.cursorMoveTo(transcriptRegion.startRow, startCol);
          screen.write(scrollIndicator);
        }
      } else {
        const transcriptRegion = {
          startRow: contentRegionStart,
          endRow: transcriptRegionEnd,
          columns: dims.columns,
        };
        if (dirtyPanels.transcript) {
          transcriptPanel.render(ctx, transcriptRegion);
          dirtyPanels.transcript = false;
        }
      }

      renderInteractiveInput();
    };

    const startBuildSpinner = (): void => {
      buildSpinnerFrame = 0;
      localLlmBuildHint = `${SPINNER_FRAMES[0]} 첫 실행 준비 중...`;
      buildSpinnerTimer = setInterval(() => {
        buildSpinnerFrame = (buildSpinnerFrame + 1) % SPINNER_FRAMES.length;
        localLlmBuildHint = `${SPINNER_FRAMES[buildSpinnerFrame]} 첫 실행 준비 중...`;
        render();
      }, 100);
      render();
    };

    const stopBuildSpinner = (): void => {
      if (buildSpinnerTimer !== undefined) {
        clearInterval(buildSpinnerTimer);
        buildSpinnerTimer = undefined;
      }
      localLlmBuildHint = null;
      render();
    };

    const unsubBuildEvents = onLlamaBuildPhase((phase) => {
      if (phase === "building") startBuildSpinner();
      else stopBuildSpinner();
    });

    // Phase 3.2: Create onProgress callback
    let lastProgressRenderAt = 0;
    const PROGRESS_RENDER_INTERVAL_MS = 200;
    const onProgress = (event: PipelineProgressEvent): void => {
      eventRouter.routePipelineProgress(event);
      dirtyPanels.pipeline = true;
      if (nativePassthroughMode && isExecuting) {
        return;
      }
      if (embeddedPaneMode && isExecuting) {
        const now = Date.now();
        if (now - lastProgressRenderAt < PROGRESS_RENDER_INTERVAL_MS) {
          return;
        }
        lastProgressRenderAt = now;
        requestRender("pipeline-progress");
        return;
      }
      render();
    };

    // Phase 3.1: Handle user input
    // Korean input handling considerations:
    // 1. StringDecoder ensures complete UTF-8 characters from split chunks
    // 2. Committed UTF-8 characters are appended directly; do not rewrite prior Hangul syllables
    // 3. Display width calculation: Korean characters are 2 columns wide in terminal
    // 4. Escape sequences: handled separately before character-by-character processing
    const onData = (chunk: Buffer): void => {
      const decodedText = decoder.write(chunk);
      const { cleanedText, handledWheel } = applyMouseWheelEvents(decodedText);
      const text = cleanedText;

      if (isTerminalFocusInSequence(text)) {
        requestFullRender();
        render();
        return;
      }

      if (isTerminalFocusOutSequence(text)) {
        return;
      }

      if (handledWheel && text.length === 0) {
        return;
      }

      if (isExecuting) {
        if (text === "\x03") {
          closeExecutionControllers("SIGINT");
          markActiveRunCancelled();
          embeddedTerminalFocus.focusDetoks();
          render();
          return;
        }

        if (embeddedPaneMode && embeddedTerminalFocus.focus !== "adapter-terminal") {
          if (text === "\x1b[A") {
            scrollEmbeddedViewportBy(-1);
            render();
          } else if (text === "\x1b[B") {
            scrollEmbeddedViewportBy(1);
            render();
          } else if (text === "\x1b[5~") {
            scrollEmbeddedViewportBy(-Math.max(1, Math.floor(screen.getDimensions().rows / 3)));
            render();
          } else if (text === "\x1b[6~") {
            scrollEmbeddedViewportBy(Math.max(1, Math.floor(screen.getDimensions().rows / 3)));
            render();
          } else if (text === "\x1b[H" || text === "\x1b[1~") {
            const dims = screen.getDimensions();
            const inputLayout = measureInputLayout(dims, input, cursor);
            embeddedTerminalPane.scrollToTop(dims.columns, getEmbeddedTranscriptHeight(inputLayout));
            render();
          } else if (text === "\x1b[F" || text === "\x1b[4~") {
            embeddedTerminalPane.scrollToBottom();
            render();
          }
          return;
        }

        // Embedded pane: forward raw bytes to child while adapter-terminal is focused
        if (embeddedPaneMode && embeddedTerminalFocus.focus === "adapter-terminal") {
          if (isEmbeddedTerminalReturnToDetoksKey(text)) {
            clearNativeEscapeTimer();
            embeddedTerminalFocus.focusDetoks();
            renderInteractiveInput();
            return;
          }

          if (activeAdapterController !== null) {
            activeAdapterController.write(text);
            return;
          }

          if (embeddedNativeCliSession !== null) {
            embeddedNativeCliSession.write(text);
          }
        }
        return;
      }

      // Use StringDecoder to handle multi-byte UTF-8 sequences that may be split across chunks
      // This ensures Korean and other Unicode characters don't get corrupted
      let needsFullRender = false;
      let i = 0;

      // Process text, handling both escape sequences and individual characters
      while (i < text.length) {
        let handled = false;

        if (pendingApprovalPrompt !== null) {
          const char = text.charAt(i);
          if (skipApprovalLineFeed) {
            if (char === "\n") {
              skipApprovalLineFeed = false;
              i++;
              continue;
            }

            skipApprovalLineFeed = false;
          }

          if (char === "\x03") {
            closeExecutionControllers("SIGINT");
            running = false;
            needsFullRender = true;
            i++;
            continue;
          }

          if (char === "\r" || char === "\n") {
            const approvedPrompt = pendingApprovalPrompt;
            pendingApprovalPrompt = null;
            skipApprovalLineFeed = false;
            if (approvedPrompt !== null) {
              executePrompt(approvedPrompt, activeRunBlock ?? undefined);
            }
            i++;
            continue;
          }

          if (char === "\x1b") {
            if (activeRunBlock !== null) {
              activeRunBlock.status = "cancelled";
              activeRunBlock.completedAt = Date.now();
              activeRunBlock.summaryLines = ["실행이 취소되었습니다."];
              setStickyPromptFromRun(activeRunBlock);
            }
            ({ input, cursor } = setInput(pendingApprovalPrompt));
            pendingApprovalPrompt = null;
            skipApprovalLineFeed = false;
            render();
            i++;
            continue;
          }

          i++;
          continue;
        }

        // Check for escape sequences first (multi-character sequences)
        // Must be processed as atomic units before character-by-character handling
        if (text.charCodeAt(i) === 0x1b && i + 2 < text.length) {
          // Bracketed paste mode sequences (\x1b[200~ = paste start, \x1b[201~ = paste end)
          if (text.startsWith("\x1b[200~", i)) {
            isPasting = true;
            i += 6;
            handled = true;
          } else if (text.startsWith("\x1b[201~", i)) {
            isPasting = false;
            i += 6;
            handled = true;
          }

          if (handled) {
            continue;
          }

          const matchedScrollSequence = (
            ["\x1b[5~", "\x1b[6~", "\x1b[H", "\x1b[F", "\x1b[1~", "\x1b[4~"] as const
          ).find((candidate) => text.startsWith(candidate, i));
          if (matchedScrollSequence !== undefined && embeddedPaneMode) {
            if (matchedScrollSequence === "\x1b[5~") {
              scrollEmbeddedViewportBy(-Math.max(1, Math.floor(screen.getDimensions().rows / 3)));
            } else if (matchedScrollSequence === "\x1b[6~") {
              scrollEmbeddedViewportBy(Math.max(1, Math.floor(screen.getDimensions().rows / 3)));
            } else if (matchedScrollSequence === "\x1b[H" || matchedScrollSequence === "\x1b[1~") {
              const dims = screen.getDimensions();
              const inputLayout = measureInputLayout(dims, input, cursor);
              embeddedTerminalPane.scrollToTop(dims.columns, getEmbeddedTranscriptHeight(inputLayout));
            } else {
              embeddedTerminalPane.scrollToBottom();
            }
            needsFullRender = true;
            i += matchedScrollSequence.length;
            handled = true;
            continue;
          }

          // P3-3 2단계: Home/End → cursor home/end in non-embedded mode.
          if (!embeddedPaneMode) {
            if (matchedScrollSequence === "\x1b[H" || matchedScrollSequence === "\x1b[1~") {
              ({ input, cursor } = moveCursorHome({ input, cursor }));
              renderInputOnly();
              i += matchedScrollSequence.length;
              handled = true;
              continue;
            }
            if (matchedScrollSequence === "\x1b[F" || matchedScrollSequence === "\x1b[4~") {
              ({ input, cursor } = moveCursorEnd({ input, cursor }));
              renderInputOnly();
              i += matchedScrollSequence.length;
              handled = true;
              continue;
            }
          }

          // P3-1: Alt+↑/↓ (xterm SGR \x1b[1;3A / \x1b[1;3B) shifts transcript
          // weight ±1. Detect BEFORE the 3-char arrow dispatch since these
          // are 6-char sequences.
          if (text.startsWith("\x1b[1;3A", i) || text.startsWith("\x1b[1;3B", i)) {
            const delta = text.charAt(i + 5) === "A" ? 1 : -1;
            layoutOverrides = computeShiftedOverrides(layoutOverrides, delta);
            void saveLayoutOverrides(layoutOverridesPath, layoutOverrides).catch(
              () => undefined,
            );
            needsFullRender = true;
            i += 6;
            handled = true;
            continue;
          }

          const sequence = text.substring(i, i + 3);
          if (embeddedPaneMode && embeddedTerminalFocus.focus === "adapter-terminal") {
            if (pendingNativeEscapeReturn) {
              clearNativeEscapeTimer();
              ensureEmbeddedNativeCliSession();
              embeddedNativeCliSession?.write("\x1b");
            }
            ensureEmbeddedNativeCliSession();
            embeddedNativeCliSession?.write(sequence);
            i += 3;
            handled = true;
            continue;
          }
          if (sequence === "\x1b[A") {
            const slashAutocompleteQuery = getSlashAutocompleteQuery(input);
            if (slashAutocompleteQuery !== null) {
              slashAutocompleteSelectedIndex = getNextSlashAutocompleteIndex(
                slashAutocompleteSelectedIndex,
                "up",
                getSlashAutocompleteCommands(state.adapter, slashAutocompleteQuery).length,
              );
              renderInteractiveInput();
            } else {
              // P3-3: ↑ recalls older history entry (replaces scroll-by-1).
              // PageUp still scrolls the viewport.
              const recalled = inputHistory.recallOlder(input);
              if (recalled !== null) {
                ({ input, cursor } = setInput(recalled));
                renderInteractiveInput();
              }
            }
            i += 3;
            handled = true;
          } else if (sequence === "\x1b[B") {
            const slashAutocompleteQuery = getSlashAutocompleteQuery(input);
            if (slashAutocompleteQuery !== null) {
              slashAutocompleteSelectedIndex = getNextSlashAutocompleteIndex(
                slashAutocompleteSelectedIndex,
                "down",
                getSlashAutocompleteCommands(state.adapter, slashAutocompleteQuery).length,
              );
              renderInteractiveInput();
            } else {
              // P3-3: ↓ recalls newer history (or exits recall and restores draft).
              const recalled = inputHistory.recallNewer();
              if (recalled !== null) {
                ({ input, cursor } = setInput(recalled));
                renderInteractiveInput();
              }
            }
            i += 3;
            handled = true;
          } else if (sequence === "\x1b[D") {
            // P3-3 2단계: ← moves cursor left within input.
            ({ input, cursor } = moveCursorLeft({ input, cursor }));
            renderInputOnly();
            i += 3;
            handled = true;
          } else if (sequence === "\x1b[C") {
            // P3-3 2단계: → moves cursor right within input.
            ({ input, cursor } = moveCursorRight({ input, cursor }));
            renderInputOnly();
            i += 3;
            handled = true;
          }
        }

        // Process single character if not an escape sequence
        if (!handled) {
          const char = text.charAt(i);
          const slashAutocompleteQuery = getSlashAutocompleteQuery(input);
          const slashAutocompleteActive = slashAutocompleteQuery !== null;
          const summaryFocused =
            embeddedPaneMode && embeddedTerminalFocus.focus === "summary";
          const nativeTerminalFocused =
            embeddedPaneMode && embeddedTerminalFocus.focus === "adapter-terminal";

          if (summaryFocused) {
            if (isEmbeddedTerminalReturnToDetoksKey(char)) {
              clearNativeEscapeTimer();
              embeddedTerminalFocus.focusDetoks();
              renderInteractiveInput();
              i++;
              continue;
            }

            if (char === "\r" || char === "\n") {
              clearNativeEscapeTimer();
              if (options.executionMode === "real") {
                embeddedTerminalFocus.focusNative();
                ensureEmbeddedNativeCliSession();
                renderInteractiveInput();
              }
              i++;
              continue;
            }

            if (char === "\x1b") {
              if (pendingNativeEscapeReturn) {
                clearNativeEscapeTimer();
                embeddedTerminalFocus.focusDetoks();
                renderInteractiveInput();
              } else {
                pendingNativeEscapeReturn = true;
                pendingNativeEscapeTimer = setTimeout(() => {
                  if (!pendingNativeEscapeReturn) {
                    return;
                  }

                  pendingNativeEscapeReturn = false;
                  pendingNativeEscapeTimer = undefined;
                }, 250);
              }

              i++;
              continue;
            }

            i++;
            continue;
          }

          if (nativeTerminalFocused) {
            if (isEmbeddedTerminalReturnToDetoksKey(char)) {
              clearNativeEscapeTimer();
              embeddedTerminalFocus.focusDetoks();
              renderInteractiveInput();
              i++;
              continue;
            }

            if (isEmbeddedTerminalInterruptKey(char)) {
              ensureEmbeddedNativeCliSession();
              embeddedNativeCliSession?.write(char);
              i++;
              continue;
            }

            if (char === "\x1b") {
              if (pendingNativeEscapeReturn) {
                clearNativeEscapeTimer();
                embeddedTerminalFocus.focusDetoks();
                renderInteractiveInput();
              } else {
                pendingNativeEscapeReturn = true;
                pendingNativeEscapeTimer = setTimeout(() => {
                  if (!pendingNativeEscapeReturn) {
                    return;
                  }

                  pendingNativeEscapeReturn = false;
                  pendingNativeEscapeTimer = undefined;
                  ensureEmbeddedNativeCliSession();
                  embeddedNativeCliSession?.write("\x1b");
                }, 250);
              }

              i++;
              continue;
            }

            if (
              char === "\r" ||
              char === "\n" ||
              char === "\t" ||
              char === "\x7f" ||
              char === "\b" ||
              char.charCodeAt(0) >= 32 ||
              /[\p{L}\p{N}\p{P}\p{Z}]/u.test(char)
            ) {
              if (pendingNativeEscapeReturn) {
                clearNativeEscapeTimer();
                ensureEmbeddedNativeCliSession();
                embeddedNativeCliSession?.write("\x1b");
              }

              ensureEmbeddedNativeCliSession();
              embeddedNativeCliSession?.write(char);
              i++;
              continue;
            }
          }

          if (
            (char === "q" || char === "Q") &&
            !slashAutocompleteActive &&
            input.trim().length === 0
          ) {
            running = false;
            needsFullRender = true;
          } else if (char === "\x03") {
            // Ctrl+C: close any active embedded session before exiting
            closeExecutionControllers("SIGINT");
            running = false;
            needsFullRender = true;
          } else if (char === "\r" || char === "\n") {
            if (isPasting) {
              // During bracketed paste, newlines are part of the pasted content
              if (char === "\n") {
                ({ input, cursor } = insertAt({ input, cursor }, "\n"));
                needsFullRender = true;
              }
            } else if (input.trim()) {
              // Phase 3.2: Execute prompt
              const resolvedPrompt =
                slashAutocompleteActive && (slashAutocompleteQuery?.length ?? 0) > 0
                  ? getSlashAutocompleteSelection(
                      getSlashAutocompleteCommands(state.adapter, slashAutocompleteQuery),
                      slashAutocompleteSelectedIndex,
                    )?.usage ?? input
                  : input;
              const normalizedPrompt = resolvedPrompt.trim();
              const shouldRequestApproval =
                embeddedPaneMode &&
                options.executionMode === "real" &&
                normalizedPrompt.length > 0 &&
                !normalizedPrompt.startsWith("/");

              if (shouldRequestApproval) {
                hasExecuted = true;
                registerRunBlock(resolvedPrompt, "pending-approval");
                pendingApprovalPrompt = resolvedPrompt;
                skipApprovalLineFeed = char === "\r";
                render();
              } else {
                executePrompt(resolvedPrompt);
              }
              // P3-3: capture in history + persist async (non-fatal on failure).
              inputHistory.push(normalizedPrompt);
              void saveHistoryToDisk(historyPath, inputHistory.toArray()).catch(
                () => undefined,
              );
              ({ input, cursor } = setInput("")); // Clear input for next prompt
              slashAutocompleteSelectedIndex = 0;
            }
          } else if (embeddedPaneMode && isEmbeddedTerminalNativeFocusToggleKey(char)) {
            clearNativeEscapeTimer();
            if (options.executionMode === "real") {
              embeddedTerminalFocus.focusNative();
              ensureEmbeddedNativeCliSession();
              renderInteractiveInput();
            }
          } else if (char === "\x7f" || char === "\b") {
            // Backspace — delete code point BEFORE cursor (P3-3 2단계).
            const wasSlashAutocompleteActive = getSlashAutocompleteQuery(input) !== null;
            ({ input, cursor } = backspaceAt({ input, cursor }));
            inputHistory.resetRecall();
            slashAutocompleteSelectedIndex = 0;
            const nextInputLayout = measureInputLayout(screen.getDimensions(), input, cursor);
            const isSlashAutocompleteActive = getSlashAutocompleteQuery(input) !== null;
            if (
              wasSlashAutocompleteActive ||
              isSlashAutocompleteActive ||
              nextInputLayout.separatorRow !== lastInputSeparatorRow
            ) {
              renderInteractiveInput();
            } else {
              // Only update input area for backspace
              renderInputOnly();
            }
            i++;
            continue;
          } else if (char === "\x01") {
            // Ctrl+A — move cursor to start (P3-3 2단계, readline)
            ({ input, cursor } = moveCursorHome({ input, cursor }));
            renderInputOnly();
            i++;
            continue;
          } else if (char === "\x05") {
            // Ctrl+E — move cursor to end (P3-3 2단계, readline)
            ({ input, cursor } = moveCursorEnd({ input, cursor }));
            renderInputOnly();
            i++;
            continue;
          } else if (char === "\x04" && input.length > 0) {
            // Ctrl+D — forward-delete (only on non-empty input; empty-input
            // Ctrl+D continues to mean "exit" per shell convention, handled
            // by the earlier Ctrl+C/D exit branch).
            ({ input, cursor } = deleteAt({ input, cursor }));
            inputHistory.resetRecall();
            renderInputOnly();
            i++;
            continue;
          } else if (char.charCodeAt(0) >= 32 || /[\p{L}\p{N}\p{P}\p{Z}]/u.test(char)) {
            // Insert committed printable character at cursor (P3-3 2단계).
            // Terminal IME input arrives as committed characters; insertAt is
            // code-point safe so Korean syllables aren't split.
            const wasSlashAutocompleteActive = getSlashAutocompleteQuery(input) !== null;
            ({ input, cursor } = insertAt({ input, cursor }, char));
            inputHistory.resetRecall();
            slashAutocompleteSelectedIndex = 0;
            const nextInputLayout = measureInputLayout(screen.getDimensions(), input, cursor);
            const isSlashAutocompleteActive = getSlashAutocompleteQuery(input) !== null;
            if (
              wasSlashAutocompleteActive ||
              isSlashAutocompleteActive ||
              nextInputLayout.separatorRow !== lastInputSeparatorRow
            ) {
              renderInteractiveInput();
            } else {
              // Only update input area for normal character input (faster response)
              renderInputOnly();
            }
            i++;
            continue;
          }

          i++;
        }

        // Full render for commands that affect layout
        if (needsFullRender) {
          render();
          needsFullRender = false;
        }
      }
    };

    // Phase 3: Execute prompt function
    const executePrompt = async (prompt: string, runBlock?: TuiRunBlock): Promise<void> => {
      isExecuting = true;
      hasExecuted = true;
      const normalizedPrompt = prompt.trim();
      let currentRunBlock: TuiRunBlock | null = runBlock ?? null;
      const workspaceBefore = captureWorkspaceSnapshot(executionCwd);
      let receivedLiveAdapterEvents = false;
      try {
        if (normalizedPrompt.startsWith("/")) {
          let shouldRestoreMainScreen = false;
          const previousState = {
            adapter: state.adapter,
            adapterModel: state.adapterModel,
            translationModel: state.translationModel,
            inferenceStrength: state.inferenceStrength,
          };
          const handled = await handleSlashCommand(normalizedPrompt, {
            adapter: state.adapter,
            executionMode: options.executionMode,
            modelName: state.translationModel,
            verbose: state.verbose,
            cacheDisabled: state.cacheDisabled,
            onVerboseToggle: (enabled) => {
              state.verbose = enabled;
              resultPanel.setVerbose(enabled);
            },
            onCacheDisableToggle: (disabled) => {
              state.cacheDisabled = disabled;
            },
            onMainScreenRestore: () => {
              shouldRestoreMainScreen = true;
            },
            onAdapterChange: async (newAdapter) => {
              closeExecutionControllers();
              state.adapter = newAdapter;
              loadAndApplyConfig(newAdapter);
              updateSelectedAdapter(newAdapter);
              refreshRuntimeState();
            },
            onExit: async () => {
              running = false;
            },
            onLayoutCommand: (args) => {
              const action = parseLayoutCommand(args);
              if (action.kind === "show") {
                const w = getEffectiveWeights(layoutOverrides);
                return `현재 transcript=${w.transcriptWeight}  result=${w.resultWeight} (기본값 7/3, 사용법: /layout reset | transcript=N result=N | + | -)`;
              }
              if (action.kind === "unknown") {
                return `알 수 없는 인자: ${action.arg}. 사용법: /layout reset | transcript=N result=N | + | -`;
              }
              if (action.kind === "reset") {
                layoutOverrides = {};
              } else if (action.kind === "shift") {
                layoutOverrides = computeShiftedOverrides(layoutOverrides, action.transcriptDelta);
              } else {
                layoutOverrides = {
                  ...layoutOverrides,
                  ...(action.transcriptWeight !== undefined
                    ? { transcriptWeight: action.transcriptWeight }
                    : {}),
                  ...(action.resultWeight !== undefined
                    ? { resultWeight: action.resultWeight }
                    : {}),
                };
              }
              void saveLayoutOverrides(layoutOverridesPath, layoutOverrides).catch(
                () => undefined,
              );
              forceFullRender = true;
              const w = getEffectiveWeights(layoutOverrides);
              return `레이아웃 조정: transcript=${w.transcriptWeight} result=${w.resultWeight}`;
            },
            onNerdFontToggle: () => {
              dirtyPanels.pipeline = true;
              dirtyPanels.result = true;
            },
          });

          refreshRuntimeState();

          if (handled) {
            const stateChanged =
              previousState.adapter !== state.adapter ||
              previousState.adapterModel !== state.adapterModel ||
              previousState.translationModel !== state.translationModel ||
              previousState.inferenceStrength !== state.inferenceStrength;
            if (stateChanged || shouldRestoreMainScreen) {
              render();
            }
            return;
          }

          transcriptPanel.append(
            `\n[WARN] 알 수 없는 명령어: ${normalizedPrompt}\n도움말을 보려면 "/help"를 입력하세요.\n`,
          );
          render();
          return;
        }

        currentRunBlock = runBlock ?? registerRunBlock(prompt, "running");
        if (currentRunBlock.status !== "running") {
          updateActiveRunBlockStatus("running");
        } else {
          setStickyPromptFromRun(currentRunBlock);
        }

        if (embeddedPaneMode) {
          closeExecutionControllers();
          embeddedTerminalFocus.focusDetoks();
        }
        transcriptPanel.clear();
        resultPanel.clear();
        if (embeddedPaneMode) {
          resultPanel.setExecuting(true);
        }
        pipelinePanel.reset();
        dirtyPanels.pipeline = true;
        dirtyPanels.transcript = true;
        dirtyPanels.result = true;
        state.tokenSavingsLabel = undefined;
        if (nativePassthroughMode) {
          suspendInput();
          leaveTuiDisplay();
        } else {
          render();
        }
        startExecutionClock();

        // Phase 3.1: Create normalized request
        const request = toNormalizedRequest(
          {
            mode: "repl",
            prompt,
            adapter: state.adapter,
            executionMode: options.executionMode,
            verbose: state.verbose,
            noCache: state.cacheDisabled,
            trace: false,
            showHelp: false,
            helpTopic: "repl",
          },
          {
            mode: "repl",
            sessionId: options.sessionId || `repl-${Date.now()}`,
          },
        );

        // Phase 3.2: Execute via orchestrator with progress callback
        const result = await orchestratePipeline({
          ...request,
          ...(options.presentationMode ? { presentationMode: options.presentationMode } : {}),
          onProgress,
          onPtyController: (controller) => {
            activeAdapterController = controller;
          },
          onAdapterEvent: (event) => {
            receivedLiveAdapterEvents = true;
            if (nativePassthroughMode) {
              return;
            }

            if (embeddedPaneMode) {
              eventRouter.routeAdapterEvent(event, "embedded");
              if (event.type === "chunk") {
                ptyEventPerfCount += 1;
              }
              requestRender("adapter-event");
              return;
            } else {
              eventRouter.routeAdapterEvent(event, "transcript");
              dirtyPanels.transcript = true;
            }
            render();
          },
          onActionTimelineEvent: (event) => {
            eventRouter.routeActionTimeline(event);
dirtyPanels.pipeline = true;
            dirtyPanels.transcript = true;
            if (nativePassthroughMode && isExecuting) {
              return;
            }
            if (embeddedPaneMode && isExecuting) {
              requestRender("action-timeline");
            } else {
              render();
            }
          },
        });

        // Phase 3.3: Feed PTY events to transcript panel
        if (!receivedLiveAdapterEvents && result.adapterTranscript?.events) {
          eventRouter.routeAdapterEventBatch(
            result.adapterTranscript.events,
            embeddedPaneMode ? "embedded" : "transcript",
          );
        }

        const hasVisibleOutput = embeddedPaneMode
          ? embeddedTerminalPane.hasVisibleContent()
          : transcriptPanel.hasVisibleContent();
        if (!hasVisibleOutput) {
          const finalOutput = result.rawOutput.trim();
          if (finalOutput.length > 0) {
            if (embeddedPaneMode) {
              embeddedTerminalPane.appendFinalAnswer(finalOutput);
            } else {
              transcriptPanel.appendFinalAnswer(finalOutput);
            }
          }
        }

        const workspaceAfter = captureWorkspaceSnapshot(executionCwd);
        const workspaceDiff = diffWorkspaceSnapshots(workspaceBefore, workspaceAfter);

        const actionTimeline = buildActionTimeline(result, workspaceDiff);

        // Phase 3.4: Display result
        const completedResult = {
          ...result,
          ...(actionTimeline.length > 0 ? { actionTimeline } : {}),
        };
        resultPanel.setResult(completedResult);
        dirtyPanels.result = true;
        dirtyPanels.transcript = true;

        // P3-4: Auto-save adapter transcript when DETOKS_SAVE_TRANSCRIPTS=1.
        if (
          isAutoSaveEnabled() &&
          completedResult.adapterTranscript &&
          completedResult.adapterTranscript.events.length > 0
        ) {
          const path = resolveTranscriptPath({
            cwd: executionCwd,
            sessionId: completedResult.sessionId,
            runIndex: currentRunBlock.index,
          });
          const text = formatTranscript(completedResult.adapterTranscript, {
            sessionId: completedResult.sessionId,
            adapter: completedResult.adapter,
            ...(completedResult.originalPrompt
              ? { prompt: completedResult.originalPrompt }
              : {}),
          });
          saveTranscript(path, text)
            .then(() => {
              resultPanel.setSavedTranscriptPath(path);
              render();
            })
            .catch(() => {
              // Non-fatal — transcript export must never break the pipeline.
            });
        } else {
          resultPanel.setSavedTranscriptPath(null);
        }

        currentRunBlock.summaryLines = resultPanel.getLines();
        currentRunBlock.status = completedResult.ok ? "completed" : "failed";
        currentRunBlock.completedAt = Date.now();
        setStickyPromptFromRun(currentRunBlock);
        if (embeddedPaneMode) {
          closeExecutionControllers();
          embeddedTerminalFocus.focusDetoks();
        }
        state.tokenSavingsLabel = result.cacheHit
          ? formatCacheHitBadge(result.cacheHit)
          : formatTokenSavingsBadge(
              result.promptTokenSavings ?? result.tokenMetrics?.input ?? result.tokenMetrics?.output,
            );
        clearExecutionClock();
        if (nativePassthroughMode) {
          resumeInput();
          enterTuiDisplay();
        }
        render();

      } catch (error) {
        clearExecutionClock();
        if (nativePassthroughMode) {
          resumeInput();
          enterTuiDisplay();
        }
        // Display error
        const errorMsg = formatError(error, state.verbose);
        resultPanel.clear();
        if (currentRunBlock !== null) {
          currentRunBlock.status = "failed";
          currentRunBlock.completedAt = Date.now();
          currentRunBlock.summaryLines = [
            `✗ 실패  어댑터: ${state.adapter}  세션: ${options.sessionId ?? "new"}`,
            `요약: ${errorMsg}`,
            "다음 작업: 입력을 수정한 뒤 다시 시도하세요.",
          ];
          setStickyPromptFromRun(currentRunBlock);
        }
        if (embeddedPaneMode) {
          embeddedTerminalPane.appendFinalAnswer(`\n[ERROR] ${errorMsg}\n`);
        } else {
          transcriptPanel.append(`\n[ERROR] ${errorMsg}`);
        }
        render();
      } finally {
        clearExecutionClock();
        closeActiveAdapterController();
        if (embeddedPaneMode) {
          embeddedTerminalFocus.focusDetoks();
        }
        resumeInput();
        isExecuting = false;
      }
    };

    // P3-1: kick off layout overrides load (non-fatal) — once it resolves,
    // future renders pick up the new ratio.
    void loadLayoutOverrides(layoutOverridesPath)
      .then((loaded) => {
        if (!isEmptyOverrides(loaded)) {
          layoutOverrides = loaded;
          forceFullRender = true;
          render();
        }
      })
      .catch(() => undefined);

    stdin.on("data", onData);
    stdin.on("end", () => {
      clearNativeEscapeTimer();
      if (scheduledRenderTimer !== undefined) {
        clearTimeout(scheduledRenderTimer);
        scheduledRenderTimer = undefined;
      }
      closeExecutionControllers();
      running = false;
    });

    // Initial render
    render();

    // Phase 3.5: REPL loop - wait for user input or exit
    while (running) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    stdin.removeListener("data", onData);
    if (scheduledRenderTimer !== undefined) {
      clearTimeout(scheduledRenderTimer);
      scheduledRenderTimer = undefined;
    }
    unsubBuildEvents();
    if (buildSpinnerTimer !== undefined) {
      clearInterval(buildSpinnerTimer);
    }

    stdout.write("\n" + statusColor.info("TUI REPL이 종료되었습니다.\n") + "\n");
  } finally {
    process.off("SIGTERM", sigtermHandler);
    screen.cleanup();
  }
};
