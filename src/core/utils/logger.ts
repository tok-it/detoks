const isDebugEnabled = (): boolean => process.env.DETOKS_DEBUG === "1";

export const logger = {
  info: (msg: string, ...args: unknown[]) => {
    if (!isDebugEnabled()) {
      return;
    }
    console.error(`[INFO] ${msg}`, ...args);
  },
  warn: (msg: string, ...args: unknown[]) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[ERROR] ${msg}`, ...args),
};
