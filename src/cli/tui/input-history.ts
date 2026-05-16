import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveProjectDataDir } from "../../core/state/storage-paths.js";

const DEFAULT_MAX_ENTRIES = 1000;
const HISTORY_FILENAME = "input-history.txt";

export interface InputHistoryOptions {
  /** Maximum number of entries kept on disk + in memory. Older entries drop. */
  maxEntries?: number;
  /** Override storage location (defaults to project data dir). */
  filePath?: string;
}

export const resolveHistoryPath = (cwd: string = process.cwd()): string =>
  join(resolveProjectDataDir(cwd), HISTORY_FILENAME);

/**
 * Append-only prompt history with up/down recall semantics matching readline:
 *
 *   index === null    → not currently recalling; ↑ shows the most recent entry,
 *                       ↓ does nothing.
 *   index === 0       → showing the most recent entry; ↑ moves to older,
 *                       ↓ exits recall mode (returns to draft).
 *   index === N - 1   → showing the oldest entry; ↑ stays (no wrap),
 *                       ↓ moves toward newer.
 *
 * Entries are stored newest-first internally. The draft (typed but not
 * submitted) is preserved across recall and restored when ↓ exits recall.
 */
export class InputHistory {
  private entries: string[] = [];
  private cursor: number | null = null;
  private draft: string = "";
  private readonly maxEntries: number;

  constructor(options: InputHistoryOptions = {}) {
    this.maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
  }

  /** Replace entries (e.g. after loading from disk). Newest-first. */
  load(entries: readonly string[]): void {
    this.entries = entries.slice(0, this.maxEntries).map((e) => e);
    this.cursor = null;
    this.draft = "";
  }

  size(): number {
    return this.entries.length;
  }

  /** Returns all entries newest-first (caller may sort otherwise). */
  toArray(): readonly string[] {
    return [...this.entries];
  }

  /**
   * Push a new entry to the front (most recent). Dedupes against the immediate
   * previous entry to avoid spam from re-running the same prompt. Trims to cap.
   */
  push(entry: string): void {
    const trimmed = entry.trim();
    if (trimmed.length === 0) return;
    if (this.entries[0] === trimmed) {
      // No-op for consecutive duplicate — still reset cursor since user submitted.
      this.cursor = null;
      this.draft = "";
      return;
    }
    this.entries.unshift(trimmed);
    if (this.entries.length > this.maxEntries) {
      this.entries.length = this.maxEntries;
    }
    this.cursor = null;
    this.draft = "";
  }

  /** Move to an older entry. Returns the new visible string or null when no change. */
  recallOlder(currentDraft: string): string | null {
    if (this.entries.length === 0) return null;
    if (this.cursor === null) {
      // Entering recall — stash the current draft, return newest entry.
      this.draft = currentDraft;
      this.cursor = 0;
      return this.entries[0] ?? null;
    }
    if (this.cursor + 1 >= this.entries.length) {
      // Already at oldest — no wrap, no change.
      return null;
    }
    this.cursor += 1;
    return this.entries[this.cursor] ?? null;
  }

  /** Move to a newer entry, or exit recall mode and return the saved draft. */
  recallNewer(): string | null {
    if (this.cursor === null) return null;
    if (this.cursor === 0) {
      // Exit recall — restore the draft.
      const draft = this.draft;
      this.cursor = null;
      this.draft = "";
      return draft;
    }
    this.cursor -= 1;
    return this.entries[this.cursor] ?? null;
  }

  /** True if user is currently navigating history (vs typing a draft). */
  isRecalling(): boolean {
    return this.cursor !== null;
  }

  /** Reset recall state without altering entries (e.g. user starts typing). */
  resetRecall(): void {
    this.cursor = null;
    this.draft = "";
  }
}

/**
 * Load history entries from disk. Lines are stored newest-first, base64-encoded
 * to preserve newlines inside a single prompt. Returns empty array if file
 * absent or malformed.
 */
export const loadHistoryFromDisk = async (
  filePath: string,
): Promise<string[]> => {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return [];
  }
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const decoded: string[] = [];
  for (const line of lines) {
    try {
      const buf = Buffer.from(line, "base64");
      const text = buf.toString("utf-8");
      if (text.length > 0) decoded.push(text);
    } catch {
      // skip malformed
    }
  }
  return decoded;
};

export const saveHistoryToDisk = async (
  filePath: string,
  entries: readonly string[],
): Promise<void> => {
  await mkdir(dirname(filePath), { recursive: true });
  const lines = entries.map((entry) =>
    Buffer.from(entry, "utf-8").toString("base64"),
  );
  await writeFile(filePath, lines.join("\n") + (lines.length > 0 ? "\n" : ""), "utf-8");
};
