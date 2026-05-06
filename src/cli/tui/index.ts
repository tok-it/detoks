import { stdout, stdin } from "node:process";
import { StringDecoder } from "node:string_decoder";
import type { CliArgs } from "../types.js";
import { createScreenManager } from "./screen-manager.js";
import { renderScreenBorder, renderHeader, renderInputArea, renderFooter } from "./renderer.js";
import { computeLayout } from "./layout-manager.js";
import { PipelineStatusPanel } from "./panels/pipeline-status.js";
import { TranscriptPanel } from "./panels/transcript.js";
import { ResultSummaryPanel } from "./panels/result-summary.js";
import { toNormalizedRequest } from "../parse.js";
import { orchestratePipeline } from "../../core/pipeline/orchestrator.js";
import { colors } from "../colors.js";
import { formatError } from "../format.js";
import type { PipelineProgressEvent } from "../../core/pipeline/types.js";
import { renderConfigInfo } from "./renderer.js";

interface TuiRunOptions {
  adapter: CliArgs["adapter"];
  executionMode: CliArgs["executionMode"];
  verbose: boolean;
  sessionId?: string;
  translationModel?: string;
  adapterModel?: string;
  inferenceStrength?: string;
}

export const runTuiRepl = async (options: TuiRunOptions): Promise<void> => {
  const screen = createScreenManager(stdout, stdin);
  const decoder = new StringDecoder("utf8");

  // Initialize TUI
  screen.enterAltScreen();
  screen.setRawMode(true);
  screen.cursorHide();

  try {
    let input = "";
    let running = true;
    let isExecuting = false;

    // Initialize panels
    const pipelinePanel = new PipelineStatusPanel();
    const transcriptPanel = new TranscriptPanel();
    const resultPanel = new ResultSummaryPanel();
    let hasExecuted = false;
    let lastLayout: any = null;
    let lastInputChar = "";  // Track last character for IME composition handling

    // Build config info lines
    const configLines: string[] = [];
    if (options.translationModel || options.adapterModel) {
      configLines.push(`💬 모델: ${options.translationModel || "기본값"}`);
    }

    let adapterLine = `🔗 Adapter: ${options.adapter}`;
    if (options.adapterModel) {
      adapterLine += ` (${options.adapterModel})`;
    }
    if (options.inferenceStrength) {
      adapterLine += ` | 추론강도: ${options.inferenceStrength}`;
    }
    configLines.push(adapterLine);

    // Optimized: only update input area
    const renderInputOnly = (): void => {
      const dims = screen.getDimensions();
      const ctx = { screen, dims };
      renderInputArea(ctx, input);
      screen.flush();
    };

    const render = (): void => {
      const dims = screen.getDimensions();
      const layout = computeLayout(dims);
      const ctx = { screen, dims };

      // Render structure
      renderScreenBorder(ctx);
      renderHeader(ctx, "detoks repl");

      // Render config info
      let currentRow = 3;
      currentRow = renderConfigInfo(ctx, configLines, currentRow) + 1;

      // Separator
      screen.cursorMoveTo(currentRow, 1);
      screen.write("├" + "─".repeat(dims.columns - 2) + "┤");
      currentRow += 1;

      // Show pipeline status only after first execution or during execution
      if (hasExecuted) {
        const pipelineRegion = {
          startRow: currentRow,
          endRow: currentRow + 6,
          columns: dims.columns,
        };
        pipelinePanel.render(ctx, pipelineRegion);
        currentRow = pipelineRegion.endRow + 1;

        // Separator
        screen.cursorMoveTo(currentRow, 1);
        screen.write("├" + "─".repeat(dims.columns - 2) + "┤");
        currentRow += 1;
      } else {
        // Show welcome message before first execution
        screen.cursorMoveTo(currentRow, 1);
        screen.write("│ 💡 /help로 도움말 보기, /adapter로 어댑터 변경, q로 종료".padEnd(dims.columns - 2) + " │");
        currentRow += 1;
      }

      // Render transcript and result panels
      const transcriptRegion = {
        startRow: currentRow,
        endRow: dims.rows - 4,
        columns: dims.columns,
      };
      transcriptPanel.render(ctx, transcriptRegion);

      // Render input area
      renderInputArea(ctx, input);
      renderFooter(ctx);
      screen.flush();
    };

    // Phase 3.2: Create onProgress callback
    const onProgress = (event: PipelineProgressEvent): void => {
      pipelinePanel.update(event);
      render();
    };

    // Phase 3.1: Handle user input
    const onData = (chunk: Buffer): void => {
      if (isExecuting) {
        return; // Ignore input while executing
      }

      // Use StringDecoder to handle multi-byte UTF-8 sequences that may be split across chunks
      const text = decoder.write(chunk);
      let needsFullRender = false;

      // Process each character in the decoded text
      for (const char of text) {
        if (char === "q" || char === "Q") {
          running = false;
          needsFullRender = true;
        } else if (char === "\x03") {
          // Ctrl+C
          running = false;
          needsFullRender = true;
        } else if (char === "\r" || char === "\n") {
          if (input.trim()) {
            // Phase 3.2: Execute prompt
            executePrompt(input);
            input = ""; // Clear input for next prompt
            lastInputChar = "";  // Reset composition tracker
          }
          needsFullRender = true;
        } else if (char === "\x7f" || char === "\b") {
          // Backspace (DEL: 0x7f or Backspace: 0x08)
          // Remove last character by code point, not by byte
          const charArray = Array.from(input);
          if (charArray.length > 0) {
            charArray.pop();
            input = charArray.join("");
            lastInputChar = "";  // Reset composition tracker
          }
          // Only update input area for backspace
          renderInputOnly();
          continue;
        } else if (char === "\x1b[A") {
          // Arrow Up
          transcriptPanel.scrollUp();
          needsFullRender = true;
        } else if (char === "\x1b[B") {
          // Arrow Down
          transcriptPanel.scrollDown();
          needsFullRender = true;
        } else if (char.charCodeAt(0) >= 32 || /[\p{L}\p{N}\p{P}\p{Z}]/u.test(char)) {
          // Accept printable ASCII (>= 32) or any Unicode letter/number/punctuation/space

          // Handle IME composition for Korean/CJK characters
          // When composing (e.g., ㄱ→ㄱㅏ→가), multiple chunks arrive sequentially
          // We replace the last character only if it's still being composed
          const isKoreanChar = /[가-힯ᄀ-ᇿ]/.test(char);  // Hangul Syllables or Jamo
          const lastCharIsKorean = /[가-힯ᄀ-ᇿ]/.test(lastInputChar);

          if (isKoreanChar && lastCharIsKorean && input.length > 0) {
            // Check if the last character in input matches the last received character
            // This indicates we're still composing the same character
            const inputArray = Array.from(input);
            const lastInputStringChar = inputArray[inputArray.length - 1];

            if (lastInputStringChar === lastInputChar) {
              // Last character in input matches last received chunk - still composing
              // Replace it with the new composition state
              inputArray[inputArray.length - 1] = char;
              input = inputArray.join("");
            } else {
              // Last received chunk is different from what's in input
              // This is a new character starting, not a composition update
              input += char;
            }
          } else {
            // Normal character or first character of composition
            input += char;
          }

          lastInputChar = char;  // Track for next input
          // Only update input area for normal character input (faster response)
          renderInputOnly();
          continue;
        }

        // Full render for commands that affect layout
        if (needsFullRender) {
          render();
        }
      }
    };

    // Phase 3: Execute prompt function
    const executePrompt = async (prompt: string): Promise<void> => {
      isExecuting = true;
      hasExecuted = true;
      try {
        // Clear previous results
        transcriptPanel.clear();
        resultPanel.clear();
        pipelinePanel.reset();
        render();

        // Phase 3.1: Create normalized request
        const request = toNormalizedRequest(
          {
            mode: "repl",
            prompt,
            adapter: options.adapter,
            executionMode: options.executionMode,
            verbose: options.verbose,
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
          onProgress,
        });

        // Phase 3.3: Feed PTY events to transcript panel
        if (result.adapterTranscript?.events) {
          for (const event of result.adapterTranscript.events) {
            transcriptPanel.addEvent(event);
          }
        }

        // Phase 3.4: Display result
        resultPanel.setResult(result);
        render();

      } catch (error) {
        // Display error
        const errorMsg = formatError(error, options.verbose);
        transcriptPanel.append(`\n[ERROR] ${errorMsg}`);
        render();
      } finally {
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
