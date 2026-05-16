import { describe, expect, it } from "vitest";
import { measureInputLayout } from "../../../../../src/cli/tui/renderer.js";

const dims = (rows: number, columns: number) => ({ rows, columns });

describe("measureInputLayout cursor positioning (P3-3 2단계)", () => {
  it("defaults cursor to end of last visible line when cursorPos is omitted", () => {
    const layout = measureInputLayout(dims(24, 80), "hello");
    // First-line prompt offset is "> " (2 cols). "hello" width = 5.
    expect(layout.cursorCol).toBe(2 + 5);
    expect(layout.cursorRow).toBe(layout.inputStartRow);
  });

  it("places cursor on first line with prompt offset when cursorPos = 0", () => {
    const layout = measureInputLayout(dims(24, 80), "hello world", 0);
    expect(layout.cursorRow).toBe(layout.inputStartRow);
    // Cursor at start → just the "> " prompt offset, no input width consumed.
    expect(layout.cursorCol).toBe(2);
  });

  it("places cursor in middle of first line", () => {
    const layout = measureInputLayout(dims(24, 80), "hello world", 5);
    expect(layout.cursorRow).toBe(layout.inputStartRow);
    // "hello" width = 5, plus "> " prompt = 7
    expect(layout.cursorCol).toBe(2 + 5);
  });

  it("places cursor at end when cursorPos equals input length", () => {
    const layout = measureInputLayout(dims(24, 80), "hello", 5);
    expect(layout.cursorRow).toBe(layout.inputStartRow);
    expect(layout.cursorCol).toBe(2 + 5);
  });

  it("handles cursorPos beyond input length by clamping to end", () => {
    const layout = measureInputLayout(dims(24, 80), "hi", 99);
    expect(layout.cursorCol).toBe(2 + 2);
  });

  it("counts CJK display width (2 cells per Korean syllable)", () => {
    // "한" is 2 display cells; with cursor after it, col = 2 (prompt) + 2 (한)
    const layout = measureInputLayout(dims(24, 80), "한", 1);
    expect(layout.cursorCol).toBe(2 + 2);
  });

  it("moves cursor to second wrapped line when input exceeds first-line width", () => {
    // dims.columns = 10 → first-line width = 8 (after "> " prompt). Continuation width = 10.
    // input "1234567890ab" should wrap: line0 = "12345678", line1 = "90ab"
    const layout = measureInputLayout(dims(24, 10), "1234567890ab", 12);
    expect(layout.cursorRow).toBeGreaterThan(layout.inputStartRow);
    // Cursor at end of line1, which is "90ab" (4 chars). No prompt offset on continuation.
    expect(layout.cursorCol).toBe(4);
  });

  it("places cursor at line break boundary correctly", () => {
    // cursor=8 means after "12345678" → start of next continuation line.
    const layout = measureInputLayout(dims(24, 10), "1234567890ab", 8);
    // 8 chars + prompt offset 2 = 10 col, which is end-of-line on a 10-col window.
    // wrapInputLines keeps the chars on line 0 until they exceed width.
    expect(layout.cursorRow).toBe(layout.inputStartRow);
    expect(layout.cursorCol).toBe(2 + 8);
  });

  it("handles multi-line input via explicit \\n", () => {
    // input.slice(0, 5) = "abc\nd" → wrap into ["abc", "d"]
    const layout = measureInputLayout(dims(24, 80), "abc\ndef", 5);
    // Cursor on line 1 (continuation), at end of "d" (col 1, no prompt offset).
    expect(layout.cursorRow).toBe(layout.inputStartRow + 1);
    expect(layout.cursorCol).toBe(1);
  });

  it("returns identical layout (besides cursor) regardless of cursorPos for plain input", () => {
    const withCursor = measureInputLayout(dims(24, 80), "hello world", 3);
    const withoutCursor = measureInputLayout(dims(24, 80), "hello world");
    expect(withCursor.visibleLines).toEqual(withoutCursor.visibleLines);
    expect(withCursor.separatorRow).toBe(withoutCursor.separatorRow);
    expect(withCursor.inputStartRow).toBe(withoutCursor.inputStartRow);
    expect(withCursor.totalLineCount).toBe(withoutCursor.totalLineCount);
  });
});
