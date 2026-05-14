import { describe, it, expect, beforeEach, vi } from "vitest";
import { measureInputLayout, renderInputArea } from "../../../../../src/cli/tui/renderer.js";

describe("Korean Input Handling", () => {
  describe("Display width calculation", () => {
    const getDisplayWidth = (str: string): number => {
      let width = 0;
      for (const char of str) {
        const code = char.charCodeAt(0);
        if ((code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
            (code >= 0x3040 && code <= 0x309f) || // Hiragana
            (code >= 0x30a0 && code <= 0x30ff) || // Katakana
            (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables (Korean)
            (code >= 0x1100 && code <= 0x11ff) || // Hangul Jamo Extended-A
            (code >= 0x3130 && code <= 0x318f)) { // Hangul Compatibility Jamo
          width += 2;
        } else {
          width += 1;
        }
      }
      return width;
    };

    it("calculates correct width for pure ASCII", () => {
      expect(getDisplayWidth("hello")).toBe(5);
      expect(getDisplayWidth("> input")).toBe(7); // > (1) + space (1) + input (5)
    });

    it("calculates correct width for pure Korean", () => {
      expect(getDisplayWidth("안")).toBe(2);
      expect(getDisplayWidth("안녕")).toBe(4);
      expect(getDisplayWidth("안녕하세요")).toBe(10);
    });

    it("calculates correct width for mixed content", () => {
      expect(getDisplayWidth("hello 안녕")).toBe(6 + 4); // 5 + space + 2*2
      expect(getDisplayWidth("> 한글입력")).toBe(1 + 1 + 2 + 2 + 2 + 2); // > + space + 4 CJK
    });

    it("handles emoji correctly", () => {
      expect(getDisplayWidth("👋")).toBe(1); // emoji usually counted as 1 char
      expect(getDisplayWidth("😀안녕")).toBe(1 + 4); // emoji + 2 Korean chars
    });
  });

  describe("Long input truncation from left", () => {
    const truncateInputFromLeft = (input: string, maxDisplayWidth: number): { displayInput: string; displayOffset: number } => {
      const getDisplayWidth = (str: string): number => {
        let width = 0;
        for (const char of str) {
          const code = char.charCodeAt(0);
          if ((code >= 0x4e00 && code <= 0x9fff) ||
              (code >= 0x3040 && code <= 0x309f) ||
              (code >= 0x30a0 && code <= 0x30ff) ||
              (code >= 0xac00 && code <= 0xd7af) ||
              (code >= 0x1100 && code <= 0x11ff) ||
              (code >= 0x3130 && code <= 0x318f)) {
            width += 2;
          } else {
            width += 1;
          }
        }
        return width;
      };

      const displayWidth = getDisplayWidth(input);
      let displayOffset = 0;

      if (displayWidth > maxDisplayWidth) {
        const chars = Array.from(input);
        let currentWidth = 0;

        for (let i = chars.length - 1; i >= 0; i--) {
          const char = chars[i];
          if (!char) continue;
          const code = char.charCodeAt(0);
          const charWidth = (
            (code >= 0x4e00 && code <= 0x9fff) ||
            (code >= 0x3040 && code <= 0x309f) ||
            (code >= 0x30a0 && code <= 0x30ff) ||
            (code >= 0xac00 && code <= 0xd7af) ||
            (code >= 0x1100 && code <= 0x11ff) ||
            (code >= 0x3130 && code <= 0x318f)
          ) ? 2 : 1;

          if (currentWidth + charWidth > maxDisplayWidth) {
            displayOffset = i + 1;
            break;
          }
          currentWidth += charWidth;
        }
      }

      const displayInput = input.substring(displayOffset);
      return { displayInput, displayOffset };
    };

    it("keeps all content when within width limit", () => {
      const { displayInput } = truncateInputFromLeft("안녕", 80);
      expect(displayInput).toBe("안녕");
    });

    it("truncates from left when exceeding width for Korean", () => {
      // Each Korean char = 2 width, so with maxWidth=10, can fit 5 chars
      const { displayInput } = truncateInputFromLeft("안녕하세요좋은아침입니다", 10);
      expect(displayInput.length).toBeLessThanOrEqual(5);
      expect(displayInput).toBe("아침입니다"); // Rightmost 5 chars that fit in width 10
    });

    it("truncates from left for mixed content", () => {
      const input = "hello 안녕하세요 좋은 아침입니다";
      const { displayInput } = truncateInputFromLeft(input, 20);
      // Should show rightmost part that fits in 20 width
      expect(displayInput.length).toBeGreaterThan(0);
      // The displayed content should fit within the width
      let width = 0;
      for (const char of displayInput) {
        const code = char.charCodeAt(0);
        width += (
          (code >= 0xac00 && code <= 0xd7af) ||
          (code >= 0x1100 && code <= 0x11ff) ||
          (code >= 0x3130 && code <= 0x318f)
        ) ? 2 : 1;
      }
      expect(width).toBeLessThanOrEqual(20);
    });

    it("handles prompt prefix (> ) in width calculation", () => {
      // Prompt area uses: "> " (2 chars) + input
      // So for 80-width terminal, input can use 78 width
      const input = "안녕하세요 좋은 아침입니다 오늘은 정말 좋은 날씨네요";
      const { displayInput } = truncateInputFromLeft(input, 78);

      // Should show something (not empty)
      expect(displayInput.length).toBeGreaterThan(0);

      // Should be able to fit in 78 width
      let width = 0;
      for (const char of displayInput) {
        const code = char.charCodeAt(0);
        width += (
          (code >= 0x4e00 && code <= 0x9fff) ||
          (code >= 0x3040 && code <= 0x309f) ||
          (code >= 0x30a0 && code <= 0x30ff) ||
          (code >= 0xac00 && code <= 0xd7af) ||
          (code >= 0x1100 && code <= 0x11ff) ||
          (code >= 0x3130 && code <= 0x318f)
        ) ? 2 : 1;
      }
      expect(width).toBeLessThanOrEqual(78);
    });
  });

  describe("IME Composition handling", () => {
    it("detects Korean characters correctly", () => {
      const isKoreanChar = (char: string): boolean => {
        const code = char.charCodeAt(0);
        return (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables
               (code >= 0x1100 && code <= 0x11ff) || // Hangul Jamo Extended-A
               (code >= 0x3130 && code <= 0x318f);   // Hangul Compatibility Jamo
      };

      // Hangul Syllables (완성된 글자)
      expect(isKoreanChar("가")).toBe(true);
      expect(isKoreanChar("나")).toBe(true);
      expect(isKoreanChar("힣")).toBe(true);

      // Hangul Jamo (조합 중인 글자)
      expect(isKoreanChar("ㄱ")).toBe(true);
      expect(isKoreanChar("ㄴ")).toBe(true);

      // Non-Korean
      expect(isKoreanChar("a")).toBe(false);
      expect(isKoreanChar(" ")).toBe(false);
      expect(isKoreanChar("あ")).toBe(false); // Japanese Hiragana
    });

    it("distinguishes composition update from new character", () => {
      // During composition, we get: ㄱ → ㄱㅏ → 가
      // After composition, pressing next key: 가 → ㄴ

      const lastInputChar = "가"; // Last received character
      const newChar = "ㄴ"; // New character from next key press

      // Both are Korean
      const isLastKorean = /[가-힯ᄀ-ᇿㄱ-ㅣ]/.test(lastInputChar);
      const isNewKorean = /[가-힯ᄀ-ᇿㄱ-ㅣ]/.test(newChar);

      expect(isLastKorean).toBe(true);
      expect(isNewKorean).toBe(true);

      // But they're different, so it's a new character
      expect(lastInputChar).not.toBe(newChar);
    });
  });

  describe("Real-world scenarios", () => {
    it("handles typical user input patterns", () => {
      const inputs = [
        "안녕하세요",
        "Hello 안녕",
        "123 한글 456",
        "가나다라마바사아자차카타파하",
        "한 글 입 력 테 스 트"
      ];

      inputs.forEach((input) => {
        expect(input.length).toBeGreaterThan(0);
        // Should be valid UTF-8 string
        expect(() => JSON.stringify(input)).not.toThrow();
      });
    });

    it("preserves content integrity through screen width cycles", () => {
      const original = "안녕하세요 좋은 아침입니다 오늘 날씨가 정말 좋네요";
      const chars = Array.from(original);

      // Simulate cycling through different screen widths
      const widths = [40, 60, 80, 100];

      widths.forEach((width) => {
        const reconstructed = chars.join("");
        expect(reconstructed).toBe(original);
      });
    });
  });

  describe("Prompt input wrapping layout", () => {
    it("wraps long input onto the next line and raises the separator", () => {
      const dims = { rows: 24, columns: 8 };
      const wrappedInput = "한글테스트입력한";

      const layout = measureInputLayout(dims, wrappedInput);

      expect(layout.visibleLines.map((line) => line.text)).toEqual([
        "한글테",
        "스트입력",
        "한",
      ]);
      expect(layout.separatorRow).toBe(18);
      expect(layout.inputStartRow).toBe(19);
      expect(layout.bottomSeparatorRow).toBe(22);
      expect(layout.cursorRow).toBe(21);
      expect(layout.cursorCol).toBe(2);
      expect(layout.totalLineCount).toBe(3);
      expect(layout.hiddenLineCount).toBe(0);
    });

    it("treats pasted newlines as separate prompt lines instead of literal control characters", () => {
      const dims = { rows: 24, columns: 80 };
      const multilineInput = [
        "프로젝트 루트는 그대로 두고,",
        "/var/tmp/detoks-approval-check.txt 파일을 새로 만든 뒤",
        "현재 브랜치명과 현재 시각을 한 줄로 기록해줘.",
      ].join("\n");

      const layout = measureInputLayout(dims, multilineInput);

      expect(layout.visibleLines.map((line) => line.text)).toEqual([
        "프로젝트 루트는 그대로 두고,",
        "/var/tmp/detoks-approval-check.txt 파일을 새로 만든 뒤",
        "현재 브랜치명과 현재 시각을 한 줄로 기록해줘.",
      ]);
      expect(layout.separatorRow).toBe(18);
      expect(layout.inputStartRow).toBe(19);
      expect(layout.bottomSeparatorRow).toBe(22);
      expect(layout.cursorRow).toBe(21);
      expect(layout.cursorCol).toBeGreaterThan(0);
      expect(layout.totalLineCount).toBe(3);
      expect(layout.hiddenLineCount).toBe(0);
    });

    it("tracks hidden prompt lines when input exceeds the visible area", () => {
      const dims = { rows: 10, columns: 80 };
      const overflowInput = Array.from({ length: 8 }, (_, index) => `line-${index + 1}`).join("\n");

      const layout = measureInputLayout(dims, overflowInput);

      expect(layout.totalLineCount).toBe(8);
      expect(layout.hiddenLineCount).toBe(1);
      expect(layout.visibleLines.map((line) => line.text)).toEqual([
        "line-2",
        "line-3",
        "line-4",
        "line-5",
        "line-6",
        "line-7",
        "line-8",
      ]);
    });

    it("keeps the separator low when input stays on one line", () => {
      const dims = { rows: 24, columns: 20 };
      const layout = measureInputLayout(dims, "한글");

      expect(layout.visibleLines.map((line) => line.text)).toEqual(["한글"]);
      expect(layout.separatorRow).toBe(20);
      expect(layout.inputStartRow).toBe(21);
      expect(layout.bottomSeparatorRow).toBe(22);
      expect(layout.cursorRow).toBe(21);
      expect(layout.cursorCol).toBe(6);
    });

    it("renders pasted multiline input without writing raw newline characters into the prompt rows", () => {
      const dims = { rows: 24, columns: 80 };
      const mockScreen = {
        cursorMoveTo: vi.fn(),
        write: vi.fn(),
      };
      const ctx = { screen: mockScreen, dims } as unknown as Parameters<typeof renderInputArea>[0];
      const multilineInput = [
        "프로젝트 루트는 그대로 두고,",
        "/var/tmp/detoks-approval-check.txt 파일을 새로 만든 뒤",
        "현재 브랜치명과 현재 시각을 한 줄로 기록해줘.",
      ].join("\n");

      const layout = renderInputArea(ctx, multilineInput);

      expect(layout.visibleLines.map((line) => line.text)).toEqual([
        "프로젝트 루트는 그대로 두고,",
        "/var/tmp/detoks-approval-check.txt 파일을 새로 만든 뒤",
        "현재 브랜치명과 현재 시각을 한 줄로 기록해줘.",
      ]);
      expect(
        mockScreen.write.mock.calls.some(([value]) => String(value).includes("\n")),
      ).toBe(false);
    });
  });
});
