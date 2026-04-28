const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
} as const;

const shouldUseColor = (): boolean => {
  if (process.env.NO_COLOR !== undefined || process.env.FORCE_COLOR === "0") {
    return false;
  }
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0") {
    return true;
  }
  if (!process.stderr.isTTY) {
    return false;
  }
  if (process.env.CI) {
    return false;
  }
  return true;
};

const wrap = (text: string, ...codes: string[]): string =>
  shouldUseColor() ? `${codes.join("")}${text}${ANSI.reset}` : text;

export const formatInfoLabel = (): string => wrap("[INFO]", ANSI.bold, ANSI.cyan);
export const formatWarnLabel = (): string => wrap("[WARN]", ANSI.bold, ANSI.yellow);
export const formatErrorLabel = (): string => wrap("[ERROR]", ANSI.bold, ANSI.red);
export const formatTraceLabel = (): string => wrap("[TRACE]", ANSI.bold, ANSI.cyan);
export const formatTraceWarningPrefix = (): string => wrap("⚠", ANSI.yellow);
export const formatTraceFailureMessage = (message: string): string => wrap(message, ANSI.red);
export const formatTraceNote = (message: string): string => wrap(message, ANSI.dim);
