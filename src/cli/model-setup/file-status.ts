import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";

export type LocalModelFileStatus =
  | { kind: "missing" }
  | { kind: "ready" }
  | { kind: "invalid"; reason: string };

export const shouldDownloadModelFile = (
  status: LocalModelFileStatus,
): boolean => status.kind === "missing" || status.kind === "invalid";

export const inspectLocalModelFile = (
  filePath: string,
): LocalModelFileStatus => {
  if (!existsSync(filePath)) {
    return { kind: "missing" };
  }

  const stats = statSync(filePath);
  if (!stats.isFile()) {
    return { kind: "invalid", reason: "일반 파일 아님" };
  }

  if (stats.size === 0) {
    return { kind: "invalid", reason: "0B" };
  }

  if (stats.size < 4) {
    return { kind: "invalid", reason: `${stats.size}B` };
  }

  const fd = openSync(filePath, "r");

  try {
    const header = Buffer.alloc(4);
    const bytesRead = readSync(fd, header, 0, 4, 0);
    if (bytesRead < 4 || header.toString("utf8", 0, 4) !== "GGUF") {
      return { kind: "invalid", reason: "GGUF 아님" };
    }
  } finally {
    closeSync(fd);
  }

  return { kind: "ready" };
};
