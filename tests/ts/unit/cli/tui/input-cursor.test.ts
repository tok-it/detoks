import { describe, expect, it } from "vitest";
import {
  backspaceAt,
  codepointLength,
  deleteAt,
  insertAt,
  moveCursorEnd,
  moveCursorHome,
  moveCursorLeft,
  moveCursorRight,
  setInput,
} from "../../../../../src/cli/tui/input-cursor.js";

describe("input-cursor", () => {
  describe("codepointLength", () => {
    it("counts ASCII characters", () => {
      expect(codepointLength("hello")).toBe(5);
    });

    it("counts Korean code points (not UTF-16 units)", () => {
      // "한글" is 2 code points
      expect(codepointLength("한글")).toBe(2);
    });

    it("counts emoji as a single code point (when not surrogate-paired)", () => {
      // Surrogate-paired emoji counts as 2 if naive; Array.from yields 1
      expect(codepointLength("😀")).toBe(1);
    });
  });

  describe("insertAt", () => {
    it("appends at end when cursor is at length", () => {
      const r = insertAt({ input: "abc", cursor: 3 }, "d");
      expect(r).toEqual({ input: "abcd", cursor: 4 });
    });

    it("inserts at beginning when cursor is 0", () => {
      const r = insertAt({ input: "abc", cursor: 0 }, "z");
      expect(r).toEqual({ input: "zabc", cursor: 1 });
    });

    it("inserts in middle and advances cursor by inserted length", () => {
      const r = insertAt({ input: "abc", cursor: 1 }, "XYZ");
      expect(r).toEqual({ input: "aXYZbc", cursor: 4 });
    });

    it("is code-point safe with Korean characters", () => {
      const r = insertAt({ input: "안녕", cursor: 1 }, "한");
      expect(r).toEqual({ input: "안한녕", cursor: 2 });
    });

    it("clamps out-of-range cursor to bounds", () => {
      const tooHigh = insertAt({ input: "abc", cursor: 99 }, "z");
      expect(tooHigh).toEqual({ input: "abcz", cursor: 4 });
      const tooLow = insertAt({ input: "abc", cursor: -5 }, "z");
      expect(tooLow).toEqual({ input: "zabc", cursor: 1 });
    });
  });

  describe("backspaceAt", () => {
    it("removes char before cursor", () => {
      const r = backspaceAt({ input: "abcd", cursor: 3 });
      expect(r).toEqual({ input: "abd", cursor: 2 });
    });

    it("is no-op at cursor 0", () => {
      const r = backspaceAt({ input: "abc", cursor: 0 });
      expect(r).toEqual({ input: "abc", cursor: 0 });
    });

    it("removes whole Korean syllable, not a UTF-16 unit", () => {
      const r = backspaceAt({ input: "안녕", cursor: 2 });
      expect(r).toEqual({ input: "안", cursor: 1 });
    });

    it("removes emoji as single code point", () => {
      const r = backspaceAt({ input: "x😀y", cursor: 2 });
      expect(r).toEqual({ input: "xy", cursor: 1 });
    });

    it("removes char before cursor in middle of string", () => {
      const r = backspaceAt({ input: "abcdef", cursor: 3 });
      expect(r).toEqual({ input: "abdef", cursor: 2 });
    });
  });

  describe("deleteAt", () => {
    it("removes char AT cursor (forward delete)", () => {
      const r = deleteAt({ input: "abc", cursor: 1 });
      expect(r).toEqual({ input: "ac", cursor: 1 });
    });

    it("is no-op at end of input", () => {
      const r = deleteAt({ input: "abc", cursor: 3 });
      expect(r).toEqual({ input: "abc", cursor: 3 });
    });

    it("removes whole Korean syllable at cursor", () => {
      const r = deleteAt({ input: "안녕하세요", cursor: 1 });
      expect(r).toEqual({ input: "안하세요", cursor: 1 });
    });
  });

  describe("cursor movement", () => {
    it("moveCursorLeft decrements but stops at 0", () => {
      expect(moveCursorLeft({ input: "abc", cursor: 2 })).toEqual({ input: "abc", cursor: 1 });
      expect(moveCursorLeft({ input: "abc", cursor: 0 })).toEqual({ input: "abc", cursor: 0 });
    });

    it("moveCursorRight increments but stops at length", () => {
      expect(moveCursorRight({ input: "abc", cursor: 1 })).toEqual({ input: "abc", cursor: 2 });
      expect(moveCursorRight({ input: "abc", cursor: 3 })).toEqual({ input: "abc", cursor: 3 });
    });

    it("moveCursorHome jumps to 0", () => {
      expect(moveCursorHome({ input: "abc", cursor: 2 })).toEqual({ input: "abc", cursor: 0 });
    });

    it("moveCursorEnd jumps to code-point length (not UTF-16 length) for Korean", () => {
      expect(moveCursorEnd({ input: "안녕하세요", cursor: 0 })).toEqual({ input: "안녕하세요", cursor: 5 });
    });
  });

  describe("setInput", () => {
    it("replaces input and places cursor at end", () => {
      expect(setInput("recalled prompt")).toEqual({ input: "recalled prompt", cursor: 15 });
    });

    it("handles empty string", () => {
      expect(setInput("")).toEqual({ input: "", cursor: 0 });
    });

    it("places cursor past Korean syllables at end", () => {
      expect(setInput("안녕")).toEqual({ input: "안녕", cursor: 2 });
    });
  });

  describe("composed scenarios", () => {
    it("type → move left → backspace → type again", () => {
      let state = { input: "", cursor: 0 };
      state = insertAt(state, "h");
      state = insertAt(state, "e");
      state = insertAt(state, "l");
      state = insertAt(state, "l");
      state = insertAt(state, "o");
      expect(state).toEqual({ input: "hello", cursor: 5 });

      state = moveCursorLeft(state); // cursor=4 (between 'l' and 'o')
      state = moveCursorLeft(state); // cursor=3 (between 'l' and 'l')
      state = backspaceAt(state); // removes second 'l' before cursor
      expect(state).toEqual({ input: "helo", cursor: 2 });

      state = insertAt(state, "X");
      expect(state).toEqual({ input: "heXlo", cursor: 3 });
    });

    it("Ctrl+A then type prepends to input", () => {
      let state = { input: "world", cursor: 5 };
      state = moveCursorHome(state);
      state = insertAt(state, "hello ");
      expect(state).toEqual({ input: "hello world", cursor: 6 });
    });

    it("Ctrl+E from middle then backspace removes last char", () => {
      let state = { input: "abcdef", cursor: 2 };
      state = moveCursorEnd(state);
      expect(state.cursor).toBe(6);
      state = backspaceAt(state);
      expect(state).toEqual({ input: "abcde", cursor: 5 });
    });
  });
});
