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
import {
  createEmbeddedTerminalFocusManager,
  isEmbeddedTerminalInterruptKey,
  isEmbeddedTerminalNativeFocusToggleKey,
  isEmbeddedTerminalReturnToDetoksKey,
} from "./focus-manager.js";
import {
  createEmbeddedNativeCliSession,
  type EmbeddedNativeCliSession,
} from "./native-cli-session.js";
import { formatEmbeddedTerminalFocusHint } from "./embedded-terminal.js";
import {
  captureWorkspaceSnapshot,
  diffWorkspaceSnapshots,
} from "./workspace-diff.js";
import { toNormalizedRequest } from "../parse.js";
import { orchestratePipeline } from "../../core/pipeline/orchestrator.js";
import { buildActionTimeline } from "../../core/timeline/action-timeline.js";
import { readRole1ModelName } from "../../core/prompt/config.js";
import type { TokenReductionSnapshot } from "../../core/utils/tokenMetrics.js";
import { colors } from "../colors.js";
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

interface TuiRunOptions {
  adapter: CliArgs["adapter"];
  executionMode: CliArgs["executionMode"];
  verbose: boolean;
  sessionId?: string;
  translationModel?: string;
  adapterModel?: string;
  inferenceStrength?: string;
  presentationMode?: CliArgs["presentationMode"];
}

const formatTokenSavingsBadge = (reduction?: TokenReductionSnapshot | null): string | undefined => {
  if (!reduction) {
    return undefined;
  }

  const percent = Math.max(0, Math.round(reduction.savedPercent));
  return `tok -${percent}%`;
};

export const runTuiRepl = async (options: TuiRunOptions): Promise<void> => {
  const screen = createScreenManager(stdout, stdin);
  const decoder = new StringDecoder("utf8");
  let currentAdapter = options.adapter;
  let currentAdapterModel = options.adapterModel ?? getAdapterModel(currentAdapter);
  let currentTranslationModel = options.translationModel ?? getTranslationModel();
  let currentVerbose = options.verbose;
  let currentInferenceStrength =
    currentAdapter === "codex"
      ? options.inferenceStrength ?? getCodexReasoningEffortOverride() ?? "medium"
      : undefined;
  const nativePassthroughMode = options.presentationMode === "passthrough";
  const embeddedPaneMode = options.presentationMode === "embedded-pane";

  const enterTuiDisplay = (): void => {
    screen.enterAltScreen();
    screen.setRawMode(true);
    screen.cursorHide();
  };

  const leaveTuiDisplay = (): void => {
    screen.setRawMode(false);
    screen.cursorShow();
    screen.exitAltScreen();
  };

  const refreshRuntimeState = (): void => {
    currentAdapterModel = getAdapterModel(currentAdapter);
    currentTranslationModel = getTranslationModel();
    currentInferenceStrength =
      currentAdapter === "codex"
        ? getCodexReasoningEffortOverride() ?? "medium"
        : undefined;
  };

  // Initialize TUI
  enterTuiDisplay();

  try {
    if (stdout.isTTY) {
      await playTuiEntryBootAnimation(stdout);
    }

    const hasInitialConfig = hasConfigFile();
    const hasRole1Model = Boolean(
      readRole1ModelName({ cwd: process.cwd() }),
    );

    if (!hasInitialConfig || !hasRole1Model) {
      leaveTuiDisplay();
      await runModelSetupIfNeeded();
      refreshRuntimeState();

      if (!hasInitialConfig) {
        await handleAdapterSwitch(currentAdapter, async (newAdapter) => {
          currentAdapter = newAdapter;
          loadAndApplyConfig(newAdapter);
          updateSelectedAdapter(newAdapter);
          refreshRuntimeState();
        });
        refreshRuntimeState();
      }

      enterTuiDisplay();
    }

    let input = "";
    let running = true;
    let isExecuting = false;

    // Initialize panels
    const pipelinePanel = new PipelineStatusPanel();
    const transcriptPanel = new TranscriptPanel();
    const resultPanel = new ResultSummaryPanel();
    const embeddedTerminalPane = new EmbeddedTerminalPane();
    const embeddedTerminalFocus = createEmbeddedTerminalFocusManager();
    let hasExecuted = false;
    let lastInputSeparatorRow = -1;
    let slashAutocompleteSelectedIndex = 0;
    const executionCwd = process.cwd();
    let currentTokenSavingsLabel: string | undefined;
    let isInputSuspended = false;
    let embeddedNativeCliSession: EmbeddedNativeCliSession | null = null;
    let pendingNativeEscapeReturn = false;
    let pendingNativeEscapeTimer: NodeJS.Timeout | undefined;

    const clearNativeEscapeTimer = (): void => {
      if (pendingNativeEscapeTimer !== undefined) {
        clearTimeout(pendingNativeEscapeTimer);
        pendingNativeEscapeTimer = undefined;
      }
      pendingNativeEscapeReturn = false;
    };

    const closeEmbeddedNativeCliSession = (): void => {
      clearNativeEscapeTimer();
      embeddedNativeCliSession?.close();
      embeddedNativeCliSession = null;
    };

    const ensureEmbeddedNativeCliSession = (): void => {
      if (!embeddedPaneMode || embeddedNativeCliSession !== null || options.executionMode !== "real") {
        return;
      }

      embeddedNativeCliSession = createEmbeddedNativeCliSession({
        adapter: currentAdapter,
        cwd: executionCwd,
        verbose: currentVerbose,
        ...(currentAdapterModel !== undefined ? { model: currentAdapterModel } : {}),
        ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
        onEvent: (event) => {
          embeddedTerminalPane.addEvent(event);
          render();
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
      const inputLayout = renderInputArea(ctx, input);
      lastInputSeparatorRow = inputLayout.separatorRow;
      screen.flush();
    };

    const renderBanner = (): void => {
      const dims = screen.getDimensions();
      const bannerLines = [
        `adapter: ${currentAdapter} | model: ${currentAdapterModel ?? "미설정"} | translate: ${currentTranslationModel ?? "미설정"}`,
        `mode: ${options.executionMode} | session: ${options.sessionId ?? "new"}`,
        "첫 프롬프트를 입력하면 아래 패널이 채워집니다 · /... 자동완성 · q 종료",
      ];

      for (const [index, line] of bannerLines.entries()) {
        if (index >= Math.min(3, dims.rows)) {
          break;
        }

        const displayLine = (line.length > dims.columns
          ? line.slice(0, Math.max(0, dims.columns - 3)) + "..."
          : line).padEnd(dims.columns);

        screen.cursorMoveTo(index, 0);
        screen.write(colors.muted(displayLine));
      }
    };

    const renderInteractiveInput = (): void => {
      const dims = screen.getDimensions();
      const ctx = { screen, dims };
      const inputLayout = measureInputLayout(dims, input);
      lastInputSeparatorRow = inputLayout.separatorRow;

      const slashAutocompleteQuery = getSlashAutocompleteQuery(input);
      const bannerRows = Math.min(3, Math.max(0, inputLayout.separatorRow));
      const statusRegionStart = bannerRows;
      const statusRegionEnd = Math.min(inputLayout.separatorRow, statusRegionStart + 8);
      const contentRegionStart = statusRegionEnd;
      const availableContentRows = Math.max(0, inputLayout.separatorRow - contentRegionStart);
      const transcriptRows =
        availableContentRows > 0
          ? Math.max(1, Math.floor(availableContentRows * 0.7))
          : 0;
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
          `${formatEmbeddedTerminalFocusHint(embeddedTerminalFocus.focus, currentAdapter)}  ·  Enter returns to detoks`,
        );
      } else {
        renderInputArea(ctx, input);
      }

      if (embeddedPaneMode && embeddedTerminalFocus.focus !== "detoks-input") {
        // Focus hint already rendered in the input area; keep the result region empty.
      } else if (slashAutocompleteQuery !== null) {
        renderSlashAutocompletePanel(
          ctx,
          resultRegion,
          slashAutocompleteQuery,
          getSlashAutocompleteCommands(currentAdapter, slashAutocompleteQuery),
          slashAutocompleteSelectedIndex,
        );
      } else {
        resultPanel.render(ctx, resultRegion);
      }

      renderFooter(
        ctx,
        buildFooterText(dims.columns, {
          adapter: currentAdapter,
          adapterModel: currentAdapterModel,
          inferenceStrength: currentInferenceStrength,
          tokenSavings: currentTokenSavingsLabel,
          cwd: executionCwd,
        }),
      );
      screen.flush();
    };

    const render = (): void => {
      const dims = screen.getDimensions();
      const ctx = { screen, dims };
      const inputLayout = measureInputLayout(dims, input);
      const bannerRows = Math.min(3, Math.max(0, inputLayout.separatorRow));
      const statusRegionStart = bannerRows;
      const statusRegionEnd = Math.min(inputLayout.separatorRow, statusRegionStart + 8);
      const contentRegionStart = statusRegionEnd;
      const availableContentRows = Math.max(0, inputLayout.separatorRow - contentRegionStart);
      const transcriptRows =
        availableContentRows > 0
          ? Math.max(1, Math.floor(availableContentRows * 0.7))
          : 0;
      const transcriptRegionEnd = Math.min(
        inputLayout.separatorRow,
        contentRegionStart + transcriptRows,
      );

      // Render structure (minimal - no borders)
      renderScreenBorder(ctx);
      renderBanner();

      const statusRegion = {
        startRow: statusRegionStart,
        endRow: statusRegionEnd,
        columns: dims.columns,
      };
      pipelinePanel.render(ctx, statusRegion);

      const transcriptRegion = {
        startRow: contentRegionStart,
        endRow: transcriptRegionEnd,
        columns: dims.columns,
      };
      if (embeddedPaneMode) {
        embeddedTerminalPane.render(ctx, transcriptRegion);
        if (embeddedNativeCliSession !== null) {
          embeddedNativeCliSession?.resize(
            transcriptRegion.columns,
            Math.max(1, transcriptRegion.endRow - transcriptRegion.startRow),
          );
        }
      } else {
        transcriptPanel.render(ctx, transcriptRegion);
      }

      renderInteractiveInput();
    };

    // Phase 3.2: Create onProgress callback
    const onProgress = (event: PipelineProgressEvent): void => {
      pipelinePanel.update(event);
      if (!nativePassthroughMode || !isExecuting) {
        render();
      }
    };

    // Phase 3.1: Handle user input
    // Korean input handling considerations:
    // 1. StringDecoder ensures complete UTF-8 characters from split chunks
    // 2. Committed UTF-8 characters are appended directly; do not rewrite prior Hangul syllables
    // 3. Display width calculation: Korean characters are 2 columns wide in terminal
    // 4. Escape sequences: handled separately before character-by-character processing
    const onData = (chunk: Buffer): void => {
      if (isExecuting) {
        return; // Ignore input while executing
      }

      // Use StringDecoder to handle multi-byte UTF-8 sequences that may be split across chunks
      // This ensures Korean and other Unicode characters don't get corrupted
      const text = decoder.write(chunk);
      let needsFullRender = false;
      let i = 0;

      // Process text, handling both escape sequences and individual characters
      while (i < text.length) {
        let handled = false;

        // Check for escape sequences first (multi-character sequences)
        // Must be processed as atomic units before character-by-character handling
        if (text.charCodeAt(i) === 0x1b && i + 2 < text.length) {
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
                getSlashAutocompleteCommands(currentAdapter, slashAutocompleteQuery).length,
              );
              renderInteractiveInput();
            } else {
              // Arrow Up
              transcriptPanel.scrollUp();
              needsFullRender = true;
            }
            i += 3;
            handled = true;
          } else if (sequence === "\x1b[B") {
            const slashAutocompleteQuery = getSlashAutocompleteQuery(input);
            if (slashAutocompleteQuery !== null) {
              slashAutocompleteSelectedIndex = getNextSlashAutocompleteIndex(
                slashAutocompleteSelectedIndex,
                "down",
                getSlashAutocompleteCommands(currentAdapter, slashAutocompleteQuery).length,
              );
              renderInteractiveInput();
            } else {
              // Arrow Down
              transcriptPanel.scrollDown();
              needsFullRender = true;
            }
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
            // Ctrl+C
            running = false;
            needsFullRender = true;
          } else if (char === "\r" || char === "\n") {
            if (input.trim()) {
              // Phase 3.2: Execute prompt
              const resolvedPrompt =
                slashAutocompleteActive && (slashAutocompleteQuery?.length ?? 0) > 0
                  ? getSlashAutocompleteSelection(
                      getSlashAutocompleteCommands(currentAdapter, slashAutocompleteQuery),
                      slashAutocompleteSelectedIndex,
                    )?.usage ?? input
                  : input;
              executePrompt(resolvedPrompt);
              input = ""; // Clear input for next prompt
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
            // Backspace (DEL: 0x7f or Backspace: 0x08)
            // Remove last character by code point, not by byte
            const wasSlashAutocompleteActive = getSlashAutocompleteQuery(input) !== null;
            const charArray = Array.from(input);
            if (charArray.length > 0) {
              charArray.pop();
              input = charArray.join("");
            }
            slashAutocompleteSelectedIndex = 0;
            const nextInputLayout = measureInputLayout(screen.getDimensions(), input);
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
          } else if (char.charCodeAt(0) >= 32 || /[\p{L}\p{N}\p{P}\p{Z}]/u.test(char)) {
            // Append committed printable characters directly.
            // Terminal IME input arrives as committed characters, so rewriting prior input
            // would erase already-entered Hangul syllables.
            const wasSlashAutocompleteActive = getSlashAutocompleteQuery(input) !== null;
            input += char;
            slashAutocompleteSelectedIndex = 0;
            const nextInputLayout = measureInputLayout(screen.getDimensions(), input);
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
    const executePrompt = async (prompt: string): Promise<void> => {
      isExecuting = true;
      hasExecuted = true;
      const workspaceBefore = captureWorkspaceSnapshot(executionCwd);
      let receivedLiveAdapterEvents = false;
      try {
        const normalizedPrompt = prompt.trim();
        if (normalizedPrompt.startsWith("/")) {
          let shouldRestoreMainScreen = false;
          const previousState = {
            adapter: currentAdapter,
            adapterModel: currentAdapterModel,
            translationModel: currentTranslationModel,
            inferenceStrength: currentInferenceStrength,
          };
          const handled = await handleSlashCommand(normalizedPrompt, {
            adapter: currentAdapter,
            executionMode: options.executionMode,
            modelName: currentTranslationModel,
            verbose: currentVerbose,
            onVerboseToggle: (enabled) => {
              currentVerbose = enabled;
            },
            onMainScreenRestore: () => {
              shouldRestoreMainScreen = true;
            },
            onAdapterChange: async (newAdapter) => {
              closeEmbeddedNativeCliSession();
              currentAdapter = newAdapter;
              loadAndApplyConfig(newAdapter);
              updateSelectedAdapter(newAdapter);
              refreshRuntimeState();
            },
            onExit: async () => {
              running = false;
            },
          });

          refreshRuntimeState();

          if (handled) {
            const stateChanged =
              previousState.adapter !== currentAdapter ||
              previousState.adapterModel !== currentAdapterModel ||
              previousState.translationModel !== currentTranslationModel ||
              previousState.inferenceStrength !== currentInferenceStrength;
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

        // Clear previous results
        if (embeddedPaneMode) {
          closeEmbeddedNativeCliSession();
          embeddedTerminalFocus.focusDetoks();
        }
        transcriptPanel.clear();
        embeddedTerminalPane.clear();
        resultPanel.clear();
        pipelinePanel.reset();
        currentTokenSavingsLabel = undefined;
        if (nativePassthroughMode) {
          suspendInput();
          leaveTuiDisplay();
        } else {
          render();
        }

        // Phase 3.1: Create normalized request
        const request = toNormalizedRequest(
          {
            mode: "repl",
            prompt,
            adapter: currentAdapter,
            executionMode: options.executionMode,
            verbose: currentVerbose,
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
          onAdapterEvent: (event) => {
            receivedLiveAdapterEvents = true;
            if (nativePassthroughMode) {
              return;
            }

            if (embeddedPaneMode) {
              embeddedTerminalPane.addEvent(event);
            } else {
              transcriptPanel.addEvent(event);
            }
            render();
          },
          onActionTimelineEvent: (event) => {
            pipelinePanel.updateActionTimelineEvent(event);
            if (!nativePassthroughMode || !isExecuting) {
              render();
            }
          },
        });

        // Phase 3.3: Feed PTY events to transcript panel
        if (!receivedLiveAdapterEvents && result.adapterTranscript?.events) {
          for (const event of result.adapterTranscript.events) {
            if (embeddedPaneMode) {
              embeddedTerminalPane.addEvent(event);
            } else {
              transcriptPanel.addEvent(event);
            }
          }
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
        resultPanel.setResult({
          ...result,
          ...(actionTimeline.length > 0 ? { actionTimeline } : {}),
        });
        if (embeddedPaneMode) {
          embeddedTerminalFocus.focusSummary();
        }
        currentTokenSavingsLabel = formatTokenSavingsBadge(
          result.promptTokenSavings ?? result.tokenMetrics?.input ?? result.tokenMetrics?.output,
        );
        if (nativePassthroughMode) {
          resumeInput();
          enterTuiDisplay();
        }
        render();

      } catch (error) {
        if (nativePassthroughMode) {
          resumeInput();
          enterTuiDisplay();
        }
        // Display error
        const errorMsg = formatError(error, currentVerbose);
        transcriptPanel.append(`\n[ERROR] ${errorMsg}`);
        render();
      } finally {
        resumeInput();
        isExecuting = false;
      }
    };

    stdin.on("data", onData);

    // Initial render
    render();

    // Phase 3.5: REPL loop - wait for user input or exit
    while (running) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    stdin.removeListener("data", onData);

    stdout.write("\n" + colors.info("TUI REPL이 종료되었습니다.\n") + "\n");
  } finally {
    screen.cleanup();
  }
};
