import {
  formatErrorLabel,
  formatInfoLabel,
  formatWarnLabel,
} from "./terminal-log-style.js";

const isDebugEnabled = (): boolean => process.env.DETOKS_DEBUG === "1";

export const logger = {
  info: (msg: string, ...args: unknown[]) => {
    if (!isDebugEnabled()) {
      return;
    }
    console.error(`${formatInfoLabel()} ${msg}`, ...args);
  },
  warn: (msg: string, ...args: unknown[]) => {
    if (!isDebugEnabled()) {
      return;
    }
    console.warn(`${formatWarnLabel()} ${msg}`, ...args);
  },
  error: (msg: string, ...args: unknown[]) => console.error(`${formatErrorLabel()} ${msg}`, ...args),
};
