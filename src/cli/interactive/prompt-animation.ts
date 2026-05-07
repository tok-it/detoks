import { buildPacmanTrackFrame } from "../terminal-spinner.js";
import {
  buildPromptPrefixText,
  buildPrompt,
  type PromptState,
} from "./prompt-builder.js";

const BOOT_FRAME_DELAY_MS = 70;
const TUI_ENTRY_BOOT_FRAME_DELAY_MS = BOOT_FRAME_DELAY_MS * 2;
const PACMAN_FRAME_COUNT = 5;
const DETOKS_PROMPT_WORD = "detoks>";
const TUI_ENTRY_PACMAN_FRAMES = ["ᗧ", "O", "ᗧ", "O", "ᗧ", "O"] as const;
const TUI_ENTRY_PROMPT_WIDTH = DETOKS_PROMPT_WORD.length;
const TUI_ENTRY_DETOKS_LETTER_COUNT = DETOKS_PROMPT_WORD.length - 1;
const TUI_ENTRY_TOKEN_COUNT = 4;
type TerminalDimensions = {
  rows: number;
  columns: number;
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
};

const colorize = (openCode: string): ((text: string) => string) => (text: string) =>
  `\x1b[${openCode}m${text}\x1b[39m`;

const TUI_ENTRY_PROMPT_COLORS = [
  colorize("36"),
  colorize("32"),
  colorize("33"),
  colorize("35"),
  colorize("34"),
  colorize("31"),
] as const;

const buildPlainPacmanTrackFrame = (frameIndex: number): string => {
  const pacman =
    TUI_ENTRY_PACMAN_FRAMES[frameIndex] ??
    TUI_ENTRY_PACMAN_FRAMES[TUI_ENTRY_PACMAN_FRAMES.length - 1] ??
    "";
  const lead = " ".repeat(frameIndex);
  const remainingTokens = Math.max(0, TUI_ENTRY_TOKEN_COUNT - frameIndex);
  const tokens = Array.from({ length: remainingTokens }, () => "•").join(" ");
  const gap = tokens ? " " : "";
  return `${lead}${pacman}${tokens ? `${gap}${tokens}` : ""}`;
};

const buildColorizedDetoksText = (progressCount: number): string => {
  const letters = Array.from("detoks");
  return `${letters
    .map((char, index) => {
      if (index >= progressCount) {
        return char;
      }

      const color = TUI_ENTRY_PROMPT_COLORS[index] ?? colorize("97");
      return color(char);
    })
    .join("")}>`;
};

const centerFrameText = (frame: string, dimensions: TerminalDimensions): string => {
  const topPadding = Math.max(0, Math.floor((dimensions.rows - 1) / 2));
  const leftPadding = Math.max(0, Math.floor((dimensions.columns - TUI_ENTRY_PROMPT_WIDTH) / 2));

  return `${"\n".repeat(topPadding)}${" ".repeat(leftPadding)}${frame}`;
};

export const buildPromptBootFrames = (state: PromptState): string[] => {
  const promptPrefix = buildPromptPrefixText(state);
  const typingFrames = Array.from(DETOKS_PROMPT_WORD).map(
    (_char, index) => `${promptPrefix}${DETOKS_PROMPT_WORD.slice(0, index + 1)}`,
  );
  const pacmanBase = `${promptPrefix}${DETOKS_PROMPT_WORD} `;
  const pacmanFrames = Array.from({ length: PACMAN_FRAME_COUNT }, (_unused, index) =>
    `${pacmanBase}${buildPacmanTrackFrame(index)}`,
  );

  return [...typingFrames, ...pacmanFrames];
};

export const buildTuiEntryBootFrames = (): string[] => {
  const typingFrames = Array.from(DETOKS_PROMPT_WORD).map(
    (_char, index) => DETOKS_PROMPT_WORD.slice(0, index + 1),
  );
  const pacmanFrames = Array.from({ length: TUI_ENTRY_DETOKS_LETTER_COUNT }, (_unused, index) =>
    `${buildColorizedDetoksText(index + 1)} ${buildPlainPacmanTrackFrame(index)}`,
  );

  return [...typingFrames, ...pacmanFrames];
};

export const buildCenteredTuiEntryFrame = (
  frame: string,
  dimensions: TerminalDimensions,
): string => centerFrameText(frame, dimensions);

export const playPromptBootAnimation = async (
  stream: NodeJS.WriteStream,
  state: PromptState,
): Promise<void> => {
  if (!stream.isTTY) {
    return;
  }

  for (const frame of buildPromptBootFrames(state)) {
    stream.write(`\r\x1b[K${frame}`);
    await sleep(BOOT_FRAME_DELAY_MS);
  }

  stream.write(`\r\x1b[K${buildPrompt(state)}`);
};

export const playTuiEntryBootAnimation = async (
  stream: NodeJS.WriteStream,
): Promise<void> => {
  if (!stream.isTTY) {
    return;
  }

  const dimensions = {
    rows: stream.rows ?? 24,
    columns: stream.columns ?? 80,
  };

  for (const frame of buildTuiEntryBootFrames()) {
    stream.write(`\x1b[2J\x1b[H${buildCenteredTuiEntryFrame(frame, dimensions)}`);
    await sleep(TUI_ENTRY_BOOT_FRAME_DELAY_MS);
  }
};
