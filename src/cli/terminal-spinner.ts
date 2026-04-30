export interface Spinner {
  stop(): void;
}

const FRAMES = [
  "ᗧ • • • •",
  "O • • • •",
  " ᗧ • • • ",
  " O • • • ",
  "  ᗧ • •  ",
  "  O • •  ",
  "   ᗧ •   ",
  "   O •   ",
  "    ᗧ    ",
  "    O    ",
] as const;

const INTERVAL_MS = 150;

const noop: Spinner = { stop: () => undefined };

export const startSpinner = (isTTY: boolean): Spinner => {
  if (!isTTY) {
    return noop;
  }

  let frameIndex = 0;
  const renderFrame = () => {
    const frame = FRAMES[frameIndex % FRAMES.length] ?? "";
    process.stdout.write(`\r${frame}`);
    frameIndex += 1;
  };

  renderFrame();
  const timer = setInterval(() => {
    renderFrame();
  }, INTERVAL_MS);

  return {
    stop() {
      clearInterval(timer);
      process.stdout.write("\r\x1b[K");
    },
  };
};
