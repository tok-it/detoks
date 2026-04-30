import { stdin as defaultInput, stdout as defaultOutput } from "node:process";
import { emitKeypressEvents } from "node:readline";
import { colors } from "../colors.js";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectWithArrowsStreams {
  input?: typeof defaultInput;
  output?: typeof defaultOutput;
  onOpen?: () => void;
  onClose?: () => void;
}

type KeyInfo = {
  name?: string;
  ctrl?: boolean;
};

const ENTER_ALT_SCREEN = "\x1b[?1049h";
const EXIT_ALT_SCREEN = "\x1b[?1049l";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR_SCREEN_AND_HOME = "\x1b[2J\x1b[H";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const normalizeVisibleText = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

const isWideCodePoint = (codePoint: number): boolean =>
  codePoint >= 0x1100 &&
  (
    codePoint <= 0x115f ||
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1f64f) ||
    (codePoint >= 0x1f900 && codePoint <= 0x1f9ff)
  );

const measureDisplayWidth = (value: string): number =>
  Array.from(value).reduce((width, char) => {
    const codePoint = char.codePointAt(0) ?? 0;
    return width + (isWideCodePoint(codePoint) ? 2 : 1);
  }, 0);

const truncateVisibleText = (value: string, maxWidth: number): string => {
  const normalized = normalizeVisibleText(value);

  if (maxWidth <= 0) {
    return "";
  }

  if (measureDisplayWidth(normalized) <= maxWidth) {
    return normalized;
  }

  if (maxWidth === 1) {
    return "…";
  }

  let width = 0;
  let result = "";

  for (const char of normalized) {
    const charWidth = isWideCodePoint(char.codePointAt(0) ?? 0) ? 2 : 1;
    if (width + charWidth > maxWidth - 1) {
      break;
    }

    result += char;
    width += charWidth;
  }

  return `${result.trimEnd()}…`;
};

export const selectWithArrows = async (
  options: SelectOption[],
  title: string,
  streams: SelectWithArrowsStreams = {},
): Promise<string | null> => {
  const input = streams.input ?? defaultInput;
  const output = streams.output ?? defaultOutput;

  if (options.length === 0) {
    output.write(colors.warning("선택 가능한 항목이 없습니다.\n\n"));
    return null;
  }

  // TTY가 아니면 대화형 UI를 띄우지 않고 첫 번째 옵션을 선택한다.
  if (!input.isTTY || !output.isTTY) {
    const firstOption = options[0];
    if (firstOption) {
      output.write(colors.success(`✓ 선택: ${firstOption.label}\n\n`));
      return firstOption.value;
    }
    return null;
  }

  const originalRawMode = input.isRaw;
  let selectedIndex = 0;
  let cleanedUp = false;
  let finished = false;
  let escapeCancelTimer: NodeJS.Timeout | null = null;
  const keepAlive = setInterval(() => undefined, 1000);
  let resolveSelection: (value: string | null) => void = () => undefined;

  const clearEscapeCancelTimer = () => {
    if (escapeCancelTimer) {
      clearTimeout(escapeCancelTimer);
      escapeCancelTimer = null;
    }
  };

  const renderMenu = () => {
    const terminalRows = Math.max(1, output.rows ?? 24);
    const terminalColumns = Math.max(20, output.columns ?? 80);
    const compactMode = terminalRows <= 8 || terminalColumns <= 40;
    const maxVisibleOptions = Math.max(1, terminalRows - (compactMode ? 4 : 5));
    const needsWindow = options.length > maxVisibleOptions;
    const windowStart = needsWindow
      ? clamp(
          selectedIndex - Math.floor(maxVisibleOptions / 2),
          0,
          Math.max(0, options.length - maxVisibleOptions),
        )
      : 0;
    const windowEnd = needsWindow
      ? windowStart + maxVisibleOptions
      : options.length;
    const visibleOptions = options.slice(windowStart, windowEnd);
    const maxLabelWidth = Math.max(8, terminalColumns - 8);
    const titleWidth = Math.max(8, terminalColumns - 2);
    const rangeText = compactMode
      ? `${windowStart + 1}-${windowEnd}/${options.length}`
      : `표시 ${windowStart + 1}-${windowEnd} / ${options.length}`;
    const footerText = compactMode
      ? "↑↓ 선택 · Enter 확정 · ESC 취소"
      : "↑↓ 화살표로 선택, Enter로 확정, ESC로 취소";

    const lines = [
      "",
      colors.title(truncateVisibleText(title, titleWidth)),
      needsWindow
        ? colors.muted(truncateVisibleText(rangeText, terminalColumns))
        : null,
      ...visibleOptions.map((option, index) => {
        const actualIndex = windowStart + index;
        const visibleLabel = truncateVisibleText(option.label, maxLabelWidth);
        return actualIndex === selectedIndex
          ? `${colors.success("▶")} ${colors.boldText(visibleLabel)}`
          : `  ${colors.muted(visibleLabel)}`;
      }),
      "",
      colors.muted(truncateVisibleText(footerText, terminalColumns)),
      "",
    ].filter((line): line is string => line !== null);

    output.write(CLEAR_SCREEN_AND_HOME);
    output.write(lines.join("\n"));
  };

  const cleanup = () => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    clearEscapeCancelTimer();
    clearInterval(keepAlive);
    input.removeListener("keypress", handleKeyPress);

    if (typeof input.setRawMode === "function") {
      input.setRawMode(originalRawMode);
    }

    input.resume();
    output.write(EXIT_ALT_SCREEN);
    output.write(SHOW_CURSOR);
    streams.onClose?.();
  };

  const finishSelection = (value: string | null) => {
    if (finished) {
      return;
    }

    finished = true;
    cleanup();
    resolveSelection(value);
  };

  const handleKeyPress = (_str: string, key?: KeyInfo) => {
    try {
      if (!key) {
        return;
      }

      if (key.ctrl && key.name === "c") {
        cleanup();
        output.write("\n");
        process.exit(130);
        return;
      }

      if (key.name === "escape") {
        clearEscapeCancelTimer();
        escapeCancelTimer = setTimeout(() => {
          finishSelection(null);
        }, 50);
        return;
      }

      clearEscapeCancelTimer();

      if (key.name === "up") {
        selectedIndex = (selectedIndex - 1 + options.length) % options.length;
      } else if (key.name === "down") {
        selectedIndex = (selectedIndex + 1) % options.length;
      } else if (key.name === "return" || key.name === "enter") {
        const selected = options[selectedIndex];
        finishSelection(selected?.value ?? null);
        return;
      } else {
        return;
      }

      renderMenu();
    } catch {
      finishSelection(null);
    }
  };

  return await new Promise((resolve) => {
    resolveSelection = resolve;
    emitKeypressEvents(input);
    input.on("keypress", handleKeyPress);
    streams.onOpen?.();
    input.setRawMode(true);
    input.resume();
    output.write(ENTER_ALT_SCREEN);
    output.write(HIDE_CURSOR);
    renderMenu();
  });
};
