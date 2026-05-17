/**
 * RunBlockScrollback — 누적 RunBlock 스크롤 뷰
 *
 * embedded-pane 모드에서 모든 RunBlock(완료/활성)의 출력을 단일
 * 스크롤 가능 뷰로 누적해 보여줍니다. 비활성 RunBlock은 스냅샷 라인을,
 * 활성 RunBlock은 EmbeddedTerminalPane의 라이브 렌더를 위임받습니다.
 */

import type { EmbeddedTerminalRenderableLine } from "./embedded-terminal.js";
import type { EmbeddedTerminalPane } from "./embedded-terminal.js";

export interface RunBlockEntry {
  id: string;
  index: number;
  prompt: string;
  status: "pending-approval" | "running" | "completed" | "failed" | "cancelled";
  /** Frozen lines for completed (disposed) blocks. */
  snapshotLines?: EmbeddedTerminalRenderableLine[];
  /** Live pane for the active (running) block. */
  pane?: EmbeddedTerminalPane;
}

export interface ScrollbackViewport {
  pinnedToBottom: boolean;
  totalLines: number;
  distanceFromBottom: number;
}

const SEPARATOR_RESET = "\x1b[0m";

function buildSeparatorLine(entry: RunBlockEntry, width: number): string {
  const statusGlyph =
    entry.status === "completed" ? "✓" :
    entry.status === "failed" ? "✗" :
    entry.status === "cancelled" ? "⊘" :
    entry.status === "running" ? "…" : "·";

  const maxPromptLen = Math.max(0, width - 20);
  const promptText = entry.prompt.length > maxPromptLen
    ? `${entry.prompt.slice(0, maxPromptLen)}…`
    : entry.prompt;

  const label = ` ${statusGlyph} #${entry.index} ${promptText} `;
  const padLen = Math.max(0, width - label.length);
  const line = `${SEPARATOR_RESET}${"─".repeat(2)}${label}${"─".repeat(padLen)}${SEPARATOR_RESET}`;

  return line;
}

export class RunBlockScrollback {
  private entries: RunBlockEntry[] = [];
  private scrollOffset = 0;

  /** Cached flattened lines (separator + content) for all completed blocks. */
  private cachedLines: EmbeddedTerminalRenderableLine[] = [];
  private cacheWidth = 0;
  private cacheDirty = true;

  /** Max number of entries to retain (oldest are evicted when exceeded). */
  private readonly maxEntries: number;

  constructor(options: { maxEntries?: number } = {}) {
    this.maxEntries = Math.max(1, options.maxEntries ?? 50);
  }

  /**
   * Replace the full entry list (called when runBlocks[] changes).
   * Marks cache dirty so next render rebuilds.
   */
  setEntries(entries: RunBlockEntry[]): void {
    this.entries = entries.slice(-this.maxEntries);
    this.cacheDirty = true;
  }

  addEntry(entry: RunBlockEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
    this.cacheDirty = true;
  }

  markDirty(): void {
    this.cacheDirty = true;
  }

  getViewport(width: number, viewportHeight: number): ScrollbackViewport {
    const totalLines = this.getTotalLines(width, viewportHeight);
    const maxOffset = Math.max(0, totalLines - Math.max(0, viewportHeight));
    const clampedOffset = Math.min(this.scrollOffset, maxOffset);

    return {
      pinnedToBottom: clampedOffset === 0,
      totalLines,
      distanceFromBottom: clampedOffset,
    };
  }

  scrollBy(deltaRows: number, viewportHeight: number, width: number): void {
    const totalLines = this.getTotalLines(width, viewportHeight);
    const maxOffset = Math.max(0, totalLines - Math.max(0, viewportHeight));

    if (deltaRows < 0) {
      // scroll up → increase offset
      this.scrollOffset = Math.min(this.scrollOffset + Math.abs(deltaRows), maxOffset);
    } else {
      // scroll down → decrease offset
      this.scrollOffset = Math.max(this.scrollOffset - deltaRows, 0);
    }
  }

  scrollToBottom(): void {
    this.scrollOffset = 0;
  }

  scrollToTop(width: number, viewportHeight: number): void {
    const totalLines = this.getTotalLines(width, viewportHeight);
    this.scrollOffset = Math.max(0, totalLines - Math.max(0, viewportHeight));
  }

  /**
   * Render the scrollback view into the given region.
   * Returns the lines that should be painted into the transcript area.
   */
  getVisibleLines(
    width: number,
    viewportHeight: number,
    opts?: { now?: number; runStartedAt?: number | null },
  ): EmbeddedTerminalRenderableLine[] {
    if (width <= 0 || viewportHeight <= 0) {
      return [];
    }

    const allLines = this.buildAllLines(width, viewportHeight, opts);
    const totalLines = allLines.length;
    const maxOffset = Math.max(0, totalLines - viewportHeight);
    const clampedOffset = Math.min(this.scrollOffset, maxOffset);

    const endIndex = Math.max(0, totalLines - clampedOffset);
    const startIndex = Math.max(0, endIndex - viewportHeight);

    return allLines.slice(startIndex, endIndex);
  }

  private getTotalLines(width: number, viewportHeight: number): number {
    return this.buildAllLines(width, viewportHeight).length;
  }

  private buildAllLines(
    width: number,
    viewportHeight: number,
    opts?: { now?: number; runStartedAt?: number | null },
  ): EmbeddedTerminalRenderableLine[] {
    if (this.entries.length === 0) {
      return [
        { text: "\x1b[2m실행 히스토리가 없습니다. 프롬프트를 실행하면 여기에 누적됩니다.\x1b[0m" },
      ];
    }

    const activeEntry = this.entries[this.entries.length - 1];
    const completedEntries = this.entries.slice(0, -1);

    // Rebuild static cache only when width changes or marked dirty
    if (this.cacheDirty || this.cacheWidth !== width) {
      this.cachedLines = [];
      for (const entry of completedEntries) {
        this.cachedLines.push({ text: buildSeparatorLine(entry, width) });
        const lines = entry.snapshotLines ?? [];
        this.cachedLines.push(...lines);
      }
      this.cacheWidth = width;
      this.cacheDirty = false;
    }

    const result: EmbeddedTerminalRenderableLine[] = [...this.cachedLines];

    // Active entry separator
    if (activeEntry !== undefined) {
      result.push({ text: buildSeparatorLine(activeEntry, width) });

      // Live pane render
      if (activeEntry.pane !== undefined) {
        const liveLines = activeEntry.pane.getRenderableLines(width, undefined, 0, opts);
        result.push(...liveLines);
      } else if (activeEntry.snapshotLines !== undefined) {
        result.push(...activeEntry.snapshotLines);
      }
    }

    return result;
  }

  /** Reset everything (e.g. /clear command). */
  reset(): void {
    this.entries = [];
    this.cachedLines = [];
    this.cacheWidth = 0;
    this.cacheDirty = true;
    this.scrollOffset = 0;
  }

  getEntryCount(): number {
    return this.entries.length;
  }
}
