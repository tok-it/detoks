import { spawnSync } from "node:child_process";
import {
  formatWorkspaceStatusEntry,
  parseWorkspaceStatusLine,
} from "../../core/timeline/workspace-status.js";

export interface WorkspaceSnapshot {
  statusLines: string[];
}

const normalizeLines = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

export const captureWorkspaceSnapshot = (cwd: string): WorkspaceSnapshot | null => {
  const result = spawnSync("git", ["status", "--short"], {
    cwd,
    encoding: "utf-8",
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  return {
    statusLines: normalizeLines(result.stdout),
  };
};

export const diffWorkspaceSnapshots = (
  before: WorkspaceSnapshot | null,
  after: WorkspaceSnapshot | null,
): string[] => {
  if (!after) {
    return [];
  }

  const beforeLines = new Set(before?.statusLines ?? []);
  const newLines = after.statusLines.filter((line) => !beforeLines.has(line));

  if (newLines.length === 0) {
    return [];
  }

  const lines = ["[WORKSPACE] 새로 바뀐 파일"];
  for (const line of newLines.slice(0, 12)) {
    const parsed = parseWorkspaceStatusLine(line);
    lines.push(`  ${parsed ? formatWorkspaceStatusEntry(parsed) : line.trimStart()}`);
  }

  if (newLines.length > 12) {
    lines.push(`  ... 외 ${newLines.length - 12}개`);
  }

  return lines;
};
