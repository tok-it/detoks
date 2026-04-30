import chalk from "chalk";

export interface Spinner {
  stop(): void;
  write(message: string): void;
}

const PACMAN_FRAMES = [
  "ᗧ",
  "O",
  "ᗧ",
  "O",
  "ᗧ",
  "O",
  "ᗧ",
  "O",
  "ᗧ",
  "O",
] as const;

const PACMAN_COLORS = [
  chalk.yellow,
  chalk.hex("#FFD93D"),
  chalk.hex("#FFB300"),
  chalk.hex("#FF8F00"),
  chalk.hex("#FFCA28"),
] as const;

const TOKEN = chalk.yellow("•");
const TOKEN_COUNT = 4;
const FRAME_CYCLE_LENGTH = TOKEN_COUNT + 1;

const INTERVAL_MS = 150;

const createNoopSpinner = (stream: NodeJS.WriteStream): Spinner => ({
  stop: () => undefined,
  write: (message: string) => {
    stream.write(message);
  },
});

const renderSpinnerFrame = (frameIndex: number): string => {
  const cycleIndex = frameIndex % FRAME_CYCLE_LENGTH;
  const pacman = PACMAN_FRAMES[cycleIndex % PACMAN_FRAMES.length] ?? "";
  const pacmanColor = PACMAN_COLORS[frameIndex % PACMAN_COLORS.length] ?? chalk.yellow;
  const lead = " ".repeat(cycleIndex);
  const remainingTokens = Math.max(0, TOKEN_COUNT - cycleIndex);
  const tokens = Array.from({ length: remainingTokens }, () => TOKEN).join(" ");
  const gap = tokens ? " " : "";
  return `${lead}${pacmanColor(pacman)}${tokens ? `${gap}${tokens}` : ""}`;
};

export const startSpinner = (
  isTTY: boolean,
  stream: NodeJS.WriteStream = process.stdout,
): Spinner => {
  if (!isTTY) {
    return createNoopSpinner(stream);
  }

  let frameIndex = 0;
  let stopped = false;
  const clearLine = () => {
    stream.write("\r\x1b[K");
  };
  const renderFrame = () => {
    const frame = renderSpinnerFrame(frameIndex);
    stream.write(`\r${frame}`);
    frameIndex += 1;
  };

  renderFrame();
  const timer = setInterval(() => {
    renderFrame();
  }, INTERVAL_MS);

  return {
    write(message: string) {
      if (stopped) {
        stream.write(message);
        return;
      }

      clearLine();
      stream.write(message);
      renderFrame();
    },
    stop() {
      stopped = true;
      clearInterval(timer);
      clearLine();
    },
  };
};
