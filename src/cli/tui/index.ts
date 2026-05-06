import { stdout, stdin } from "node:process";
import type { CliArgs } from "../types.js";
import { createScreenManager } from "./screen-manager.js";
import { renderScreenBorder, renderHeader, renderInputArea, renderFooter } from "./renderer.js";
import { computeLayout } from "./layout-manager.js";
import { PipelineStatusPanel } from "./panels/pipeline-status.js";
import { TranscriptPanel } from "./panels/transcript.js";
import { ResultSummaryPanel } from "./panels/result-summary.js";
import { colors } from "../colors.js";

interface TuiRunOptions {
  adapter: CliArgs["adapter"];
  executionMode: CliArgs["executionMode"];
  verbose: boolean;
}

export const runTuiRepl = async (options: TuiRunOptions): Promise<void> => {
  const screen = createScreenManager(stdout, stdin);

  // Initialize TUI
  screen.enterAltScreen();
  screen.setRawMode(true);
  screen.cursorHide();

  try {
    let input = "";
    let running = true;

    // Initialize panels
    const pipelinePanel = new PipelineStatusPanel();
    const transcriptPanel = new TranscriptPanel();
    const resultPanel = new ResultSummaryPanel();

    const render = (): void => {
      const dims = screen.getDimensions();
      const layout = computeLayout(dims);
      const ctx = { screen, dims };

      // Render structure
      renderScreenBorder(ctx);
      renderHeader(ctx, "detoks repl (TUI 모드)");

      // Render panels
      pipelinePanel.render(ctx, layout.statusPanelRegion);
      transcriptPanel.render(ctx, layout.transcriptRegion);
      resultPanel.render(ctx, layout.resultRegion);

      // Render input area
      renderInputArea(ctx, input);
      renderFooter(ctx);
    };

    // Handle input
    const onData = (chunk: Buffer): void => {
      const char = chunk.toString();

      if (char === "q" || char === "Q") {
        running = false;
      } else if (char === "") {
        // Ctrl+C
        running = false;
      } else if (char === "\r" || char === "\n") {
        if (input.trim()) {
          running = false;
        }
      } else if (char === "") {
        // Backspace
        input = input.slice(0, -1);
      } else if (char === "[A") {
        // Arrow Up
        transcriptPanel.scrollUp();
      } else if (char === "[B") {
        // Arrow Down
        transcriptPanel.scrollDown();
      } else if (char.length === 1 && char.charCodeAt(0) >= 32) {
        input += char;
      }

      render();
    };

    stdin.on("data", onData);

    // Initial render
    render();

    // Wait for input (blocking loop)
    while (running) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    stdin.removeListener("data", onData);

    stdout.write("\n" + colors.info("TUI REPL이 종료되었습니다.\n") + "\n");
  } finally {
    screen.cleanup();
  }
};
