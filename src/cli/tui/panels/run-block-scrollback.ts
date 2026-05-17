/**
 * RunBlockScrollback — 누적 RunBlock 스크롤 뷰
 *
 * embedded-pane 모드에서 모든 RunBlock(완료/활성)의 출력을 단일
 * 스크롤 가능 뷰로 누적해 보여줍니다. 비활성 RunBlock은 스냅샷 라인을,
 * 활성 RunBlock은 EmbeddedTerminalPane의 라이브 렌더를 위임받습니다.
 *
 * 성능 노트: getVisibleLines는 viewport 크기 만큼의 라인만 materialize 합니다.
 * 활성 pane이 수천 라인을 가지더라도 매 프레임 viewportHeight 라인만 슬라이스
 * 합니다(pane.getRenderableLines의 maxRows/scrollOffset 파라미터 활용).
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

  /** Cached flattened lines (separator + snapshot) for all completed blocks. */
  private cachedCompletedLines: EmbeddedTerminalRenderableLine[] = [];
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

  /** Mark completed-entries cache dirty (call when entry metadata changes). */
  markDirty(): void {
    this.cacheDirty = true;
  }

  getViewport(width: number, viewportHeight: number): ScrollbackViewport {
    const totalLines = this.getTotalLines(width);
    const maxOffset = Math.max(0, totalLines - Math.max(0, viewportHeight));
    const clampedOffset = Math.min(this.scrollOffset, maxOffset);

    return {
      pinnedToBottom: clampedOffset === 0,
      totalLines,
      distanceFromBottom: clampedOffset,
    };
  }

  scrollBy(deltaRows: number, viewportHeight: number, width: number): void {
    const totalLines = this.getTotalLines(width);
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
    const totalLines = this.getTotalLines(width);
    this.scrollOffset = Math.max(0, totalLines - Math.max(0, viewportHeight));
  }

  /**
   * Materialize only the visible window (~viewportHeight rows) rather than
   * the full scrollback. Critical for performance: a live pane with 10k PTY
   * lines should not allocate 10k entries per frame.
   */
  getVisibleLines(
    width: number,
    viewportHeight: number,
    opts?: { now?: number; runStartedAt?: number | null },
  ): EmbeddedTerminalRenderableLine[] {
    if (width <= 0 || viewportHeight <= 0) {
      return [];
    }

    if (this.entries.length === 0) {
      return [
        { text: "\x1b[2m실행 히스토리가 없습니다. 프롬프트를 실행하면 여기에 누적됩니다.\x1b[0m" },
      ];
    }

    this.ensureCompletedCache(width);

    const activeEntry = this.entries[this.entries.length - 1];
    const completedCount = this.cachedCompletedLines.length;

    // Active-block segment: [separator (1 row)] + [content (paneTotal or snapshot count)]
    let activeSeparatorRows = 0;
    let activeContentCount = 0;
    if (activeEntry !== undefined) {
      activeSeparatorRows = 1;
      if (activeEntry.pane !== undefined) {
        activeContentCount = activeEntry.pane.getTotalRenderableLineCount(width);
      } else {
        activeContentCount = activeEntry.snapshotLines?.length ?? 0;
      }
    }

    const totalLines = completedCount + activeSeparatorRows + activeContentCount;
    const maxOffset = Math.max(0, totalLines - viewportHeight);
    const clampedOffset = Math.min(this.scrollOffset, maxOffset);
    const endIndex = Math.max(0, totalLines - clampedOffset);
    const startIndex = Math.max(0, endIndex - viewportHeight);

    const result: EmbeddedTerminalRenderableLine[] = [];

    // Segment 1: completed lines
    if (startIndex < completedCount) {
      const compEnd = Math.min(endIndex, completedCount);
      for (let i = startIndex; i < compEnd; i += 1) {
        const line = this.cachedCompletedLines[i];
        if (line !== undefined) result.push(line);
      }
    }

    if (activeEntry === undefined) {
      return result;
    }

    // Segment 2: active separator (single line at position completedCount)
    const sepIndex = completedCount;
    if (sepIndex >= startIndex && sepIndex < endIndex) {
      result.push({ text: buildSeparatorLine(activeEntry, width) });
    }

    // Segment 3: active content (pane live or snapshot)
    const contentStart = sepIndex + activeSeparatorRows;
    const contentEnd = contentStart + activeContentCount;

    if (endIndex > contentStart && startIndex < contentEnd) {
      const localStart = Math.max(0, startIndex - contentStart);
      const localEnd = Math.min(activeContentCount, endIndex - contentStart);

      if (activeEntry.pane !== undefined) {
        // Pane: ask for a specific slice from the bottom (offset + maxRows).
        // pane.getRenderableLines(width, maxRows, scrollOffset): returns
        // compactLines.slice(total - offset - maxRows, total - offset).
        const paneOffsetFromBottom = activeContentCount - localEnd;
        const paneMaxRows = localEnd - localStart;
        if (paneMaxRows > 0) {
          const paneLines = activeEntry.pane.getRenderableLines(
            width,
            paneMaxRows,
            paneOffsetFromBottom,
            opts,
          );
          result.push(...paneLines);
        }
      } else if (activeEntry.snapshotLines !== undefined) {
        for (let i = localStart; i < localEnd; i += 1) {
          const line = activeEntry.snapshotLines[i];
          if (line !== undefined) result.push(line);
        }
      }
    }

    return result;
  }

  private getTotalLines(width: number): number {
    this.ensureCompletedCache(width);
    const activeEntry = this.entries[this.entries.length - 1];
    if (this.entries.length === 0) {
      return 1; // empty state placeholder
    }
    let activeCount = 0;
    if (activeEntry !== undefined) {
      activeCount = 1; // separator
      if (activeEntry.pane !== undefined) {
        activeCount += activeEntry.pane.getTotalRenderableLineCount(width);
      } else {
        activeCount += activeEntry.snapshotLines?.length ?? 0;
      }
    }
    return this.cachedCompletedLines.length + activeCount;
  }

  private ensureCompletedCache(width: number): void {
    if (!this.cacheDirty && this.cacheWidth === width) {
      return;
    }
    const completedEntries = this.entries.slice(0, -1);
    this.cachedCompletedLines = [];
    for (const entry of completedEntries) {
      this.cachedCompletedLines.push({ text: buildSeparatorLine(entry, width) });
      const lines = entry.snapshotLines ?? [];
      this.cachedCompletedLines.push(...lines);
    }
    this.cacheWidth = width;
    this.cacheDirty = false;
  }

  /** Reset everything (e.g. /clear command). */
  reset(): void {
    this.entries = [];
    this.cachedCompletedLines = [];
    this.cacheWidth = 0;
    this.cacheDirty = true;
    this.scrollOffset = 0;
  }

  getEntryCount(): number {
    return this.entries.length;
  }
}
