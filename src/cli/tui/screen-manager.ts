import { WriteStream, ReadStream } from "node:tty";

export interface ScreenDimensions {
  rows: number;
  columns: number;
}

export interface ScreenManager {
  write(text: string): void;
  clear(): void;
  cursorMoveTo(row: number, col: number): void;
  cursorHide(): void;
  cursorShow(): void;
  enterAltScreen(): void;
  exitAltScreen(): void;
  setRawMode(enabled: boolean): void;
  getDimensions(): ScreenDimensions;
  flush(): void;
  cleanup(): void;
}

export const createScreenManager = (
  outputStream: WriteStream,
  inputStream: ReadStream,
): ScreenManager => {
  const dims = (): ScreenDimensions => ({
    rows: outputStream.rows ?? 24,
    columns: outputStream.columns ?? 80,
  });

  return {
    write(text: string) {
      outputStream.write(text);
    },

    clear() {
      this.write("\x1b[2J");
    },

    cursorMoveTo(row: number, col: number) {
      this.write(`\x1b[${row + 1};${col + 1}H`);
    },

    cursorHide() {
      this.write("\x1b[?25l");
    },

    cursorShow() {
      this.write("\x1b[?25h");
    },

    enterAltScreen() {
      this.write("\x1b[?1049h");
    },

    exitAltScreen() {
      this.write("\x1b[?1049l");
    },

    setRawMode(enabled: boolean) {
      if (inputStream.isTTY) {
        inputStream.setRawMode(enabled);
      }
    },

    getDimensions() {
      return dims();
    },

    flush() {
      // Ensure all writes are flushed to the terminal
      // Node.js TTY streams have built-in buffering; this triggers drain if needed
      if ((outputStream as any).flush) {
        (outputStream as any).flush();
      }
    },

    cleanup() {
      try {
        this.setRawMode(false);
        this.cursorShow();
        this.exitAltScreen();
        outputStream.write("\n");
      } catch (e) {
        // Suppress cleanup errors on exit
      }
    },
  };
};
