import type { EmbeddedTerminalFocus } from "./embedded-terminal.js";

export interface EmbeddedTerminalFocusManager {
  readonly focus: EmbeddedTerminalFocus;
  setFocus: (focus: EmbeddedTerminalFocus) => void;
  focusDetoks: () => void;
  focusNative: () => void;
  focusSummary: () => void;
}

export const createEmbeddedTerminalFocusManager = (
  initialFocus: EmbeddedTerminalFocus = "detoks-input",
): EmbeddedTerminalFocusManager => {
  let focus = initialFocus;

  return {
    get focus() {
      return focus;
    },
    setFocus(nextFocus: EmbeddedTerminalFocus) {
      focus = nextFocus;
    },
    focusDetoks() {
      focus = "detoks-input";
    },
    focusNative() {
      focus = "adapter-terminal";
    },
    focusSummary() {
      focus = "summary";
    },
  };
};

export const isEmbeddedTerminalNativeFocusToggleKey = (char: string): boolean =>
  char === "\x14"; // Ctrl+T

export const isEmbeddedTerminalReturnToDetoksKey = (char: string): boolean =>
  char === "\x07" || char === "\x1b"; // Ctrl+G or Esc

export const isEmbeddedTerminalInterruptKey = (char: string): boolean =>
  char === "\x03"; // Ctrl+C

export const isTerminalFocusInSequence = (text: string): boolean =>
  text === "\x1b[I";

export const isTerminalFocusOutSequence = (text: string): boolean =>
  text === "\x1b[O";
