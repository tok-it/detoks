import { stdout, stdin } from "node:process";
import type { CliArgs } from "../types.js";
import { createScreenManager } from "./screen-manager.js";
import { renderScreenBorder, renderHeader, renderStatusPanel, renderInputArea, renderFooter } from "./renderer.js";
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

    const render = (): void => {
      const dims = screen.getDimensions();
      const pipelineStatus = [
        "파이프라인 상태",
        "  · Prompt Compiler",
        "  · Task Graph Builder",
        "  · Context Optimizer",
        "  · Executor",
        "  · State Manager",
      ];

      renderScreenBorder({ screen, dims });
      renderHeader({ screen, dims }, "detoks repl (TUI 모드)");

      const nextRow = renderStatusPanel({ screen, dims }, pipelineStatus, 3);
      renderStatusPanel(
        { screen, dims },
        [
          "",
          "어댑터: " + options.adapter,
          "실행 모드: " + options.executionMode,
          "상세 출력: " + (options.verbose ? "ON" : "OFF"),
        ],
        nextRow + 1,
      );

      renderInputArea({ screen, dims }, input);
      renderFooter({ screen, dims });
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
