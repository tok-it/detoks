import { describe, expect, it, vi } from "vitest";
import {
  fillRemaining,
  formatHiddenAboveMarker,
  formatHiddenBelowMarker,
  renderEmptyState,
  truncateByDisplayWidth,
  truncateByLength,
  writePaddedLine,
} from "../../../../../../src/cli/tui/panels/base.js";
import { measureDisplayWidth } from "../../../../../../src/cli/tui/renderer.js";
import { statusColor } from "../../../../../../src/cli/tui/design/tokens.js";

const stripAnsi = (value: string): string =>
  value
    .replace(/\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\][^]*(?:|\\)/g, "");

const makeCtx = () => {
  const screen = {
    cursorMoveTo: vi.fn(),
    write: vi.fn(),
  };
  return {
    ctx: { screen, dims: { rows: 24, columns: 80 } } as any,
    screen,
  };
};

const region = (startRow: number, endRow: number, columns: number) => ({
  startRow,
  endRow,
  columns,
});

describe("panel base helpers", () => {
  describe("fillRemaining", () => {
    it("writes blank padded rows from start row to region end", () => {
      const { ctx, screen } = makeCtx();
      const r = region(5, 9, 20);
      const finalRow = fillRemaining(ctx, r, 5);
      expect(finalRow).toBe(9);
      expect(screen.cursorMoveTo).toHaveBeenCalledTimes(4);
      expect(screen.write).toHaveBeenCalledTimes(4);
      for (const call of screen.write.mock.calls) {
        expect(call[0]).toBe(" ".repeat(20));
      }
    });

    it("does nothing when fromRow already at region end", () => {
      const { ctx, screen } = makeCtx();
      const r = region(5, 9, 20);
      const finalRow = fillRemaining(ctx, r, 9);
      expect(finalRow).toBe(9);
      expect(screen.cursorMoveTo).not.toHaveBeenCalled();
    });
  });

  describe("writePaddedLine", () => {
    it("pads text to usableWidth and applies style", () => {
      const { ctx, screen } = makeCtx();
      const style = (text: string) => `[S]${text}[/S]`;
      writePaddedLine(ctx, 2, "hi", 6, style);
      expect(screen.cursorMoveTo).toHaveBeenCalledWith(2, 0);
      expect(screen.write).toHaveBeenCalledWith("[S]hi    [/S]");
    });

    it("defaults to identity style when none provided", () => {
      const { ctx, screen } = makeCtx();
      writePaddedLine(ctx, 0, "ok", 4);
      expect(screen.write).toHaveBeenCalledWith("ok  ");
    });

    it("truncates long wide-character text before padding", () => {
      const { ctx, screen } = makeCtx();
      writePaddedLine(ctx, 0, "도구: codex 실행: 매우 긴 명령어입니다", 12);
      const written = screen.write.mock.calls[0]?.[0] as string;
      expect(measureDisplayWidth(written)).toBe(12);
      expect(written).toContain("…");
    });
  });

  describe("renderEmptyState", () => {
    it("renders muted lines and fills the rest of the region", () => {
      const { ctx, screen } = makeCtx();
      const r = region(0, 4, 10);
      const finalRow = renderEmptyState(ctx, r, ["a", "b"]);
      expect(finalRow).toBe(4);
      const written = screen.write.mock.calls.map((c) => stripAnsi(c[0] as string));
      expect(written[0]).toBe("a         ");
      expect(written[1]).toBe("b         ");
      expect(written[2]).toBe(" ".repeat(10));
      expect(written[3]).toBe(" ".repeat(10));
    });

    it("applies the muted token style by default", () => {
      const { ctx, screen } = makeCtx();
      const r = region(0, 1, 4);
      renderEmptyState(ctx, r, ["x"]);
      const expected = statusColor.muted("x   ");
      expect(screen.write).toHaveBeenCalledWith(expected);
    });
  });

  describe("truncateByLength", () => {
    it("pads when text already fits", () => {
      expect(truncateByLength("ab", 5)).toBe("ab   ");
    });

    it("ellipsizes with three dots when too long", () => {
      expect(truncateByLength("abcdefghij", 6)).toBe("abc...");
    });

    it("returns empty for zero width", () => {
      expect(truncateByLength("abc", 0)).toBe("");
    });
  });

  describe("truncateByDisplayWidth", () => {
    it("preserves CJK width when fitting", () => {
      const text = "한글"; // 4 display cells
      expect(truncateByDisplayWidth(text, 6)).toBe("한글");
    });

    it("uses single-char ellipsis when truncating CJK", () => {
      const text = "한국어테스트"; // 12 display cells
      const result = truncateByDisplayWidth(text, 5);
      expect(result.endsWith("…")).toBe(true);
    });
  });

  describe("hidden-line markers", () => {
    it("formats above marker with count", () => {
      expect(formatHiddenAboveMarker(5)).toBe("… ↑ 5줄 위");
    });

    it("formats below marker with count", () => {
      expect(formatHiddenBelowMarker(12)).toBe("… ↓ 12줄 아래");
    });

    it("returns empty string when count is zero", () => {
      expect(formatHiddenAboveMarker(0)).toBe("");
      expect(formatHiddenBelowMarker(0)).toBe("");
    });

    it("returns empty string when count is negative", () => {
      expect(formatHiddenAboveMarker(-3)).toBe("");
      expect(formatHiddenBelowMarker(-1)).toBe("");
    });
  });
});
