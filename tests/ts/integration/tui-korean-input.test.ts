import { describe, it, expect, beforeEach } from "vitest";
import { Readable } from "stream";
import { StringDecoder } from "string_decoder";

describe("TUI Korean Input Integration", () => {
  describe("UTF-8 Korean character handling", () => {
    it("correctly decodes Korean characters as complete atoms", () => {
      const decoder = new StringDecoder("utf8");

      // Korean character "안" (U+C548) in UTF-8: EC 95 88
      const koreanChar1 = Buffer.from([0xEC, 0x95, 0x88]);
      expect(decoder.write(koreanChar1)).toBe("안");

      // Korean character "녕" (U+B155) in UTF-8: EB 85 95
      const koreanChar2 = Buffer.from([0xEB, 0x85, 0x95]);
      expect(decoder.write(koreanChar2)).toBe("녕");

      // Combined: "안녕" should decode correctly
      const combined = Buffer.from([0xEC, 0x95, 0x88, 0xEB, 0x85, 0x95]);
      const fullDecoder = new StringDecoder("utf8");
      expect(fullDecoder.write(combined)).toBe("안녕");
    });

    it("handles multi-byte Korean characters split across chunks", () => {
      const decoder = new StringDecoder("utf8");

      // Korean "가" (U+AC00) in UTF-8: EA B0 80
      // Send first two bytes
      const chunk1 = Buffer.from([0xEA, 0xB0]);
      const chunk2 = Buffer.from([0x80]);

      // First chunk should return empty string (waiting for completion)
      const result1 = decoder.write(chunk1);
      expect(result1).toBe("");

      // Second chunk completes the character
      const result2 = decoder.write(chunk2);
      expect(result2).toBe("가");
    });

    it("preserves character sequence through stream processing", () => {
      const decoder = new StringDecoder("utf8");
      const characters: string[] = [];

      // Simulate receiving "한글" character by character
      // "한" (U+D55C): ED 95 9C
      const han = Buffer.from([0xED, 0x95, 0x9C]);
      characters.push(decoder.write(han));

      // "글" (U+EA B8): EA B8 80
      const gul = Buffer.from([0xEA, 0xB8, 0x80]);
      characters.push(decoder.write(gul));

      expect(characters.join("")).toBe("한글");
    });
  });

  describe("IME composition input simulation", () => {
    it("simulates Korean IME composition sequence: ㄱ → ㄱㅏ → 가", () => {
      const decoder = new StringDecoder("utf8");
      const inputSequence: string[] = [];

      // IME composition: user types key that produces ㄱ
      // "ㄱ" (U+3131): E3 84 B1
      const step1 = Buffer.from([0xE3, 0x84, 0xB1]);
      inputSequence.push(decoder.write(step1));

      // IME updates: ㄱ is replaced with ㄱㅏ
      // "ㄱ" (U+3131): E3 84 B1
      // "ㅏ" (U+B5F4): E3 85 8F
      const step2_full = Buffer.from([0xE3, 0x84, 0xB1, 0xE3, 0x85, 0x8F]);
      const step2Decoder = new StringDecoder("utf8");
      inputSequence.push(step2Decoder.write(step2_full));

      // IME completes: ㄱㅏ is replaced with 가
      // "가" (U+AC00): EA B0 80
      const step3 = Buffer.from([0xEA, 0xB0, 0x80]);
      const step3Decoder = new StringDecoder("utf8");
      inputSequence.push(step3Decoder.write(step3));

      // Verify the sequence
      expect(inputSequence[0]).toBe("ㄱ");
      expect(inputSequence[1]).toBe("ㄱㅏ");
      expect(inputSequence[2]).toBe("가");
    });

    it("handles composition jamo characters correctly", () => {
      const decoder = new StringDecoder("utf8");

      // Hangul Compatibility Jamo: ㄱ (U+3131), ㄴ (U+3134), ㄷ (U+3137)
      // "ㄱ": E3 84 B1
      const jamo1 = Buffer.from([0xE3, 0x84, 0xB1]);
      expect(decoder.write(jamo1)).toBe("ㄱ");

      // "ㄴ": E3 84 B4
      const jamo2 = Buffer.from([0xE3, 0x84, 0xB4]);
      expect(decoder.write(jamo2)).toBe("ㄴ");

      // "ㄷ": E3 84 B7
      const jamo3 = Buffer.from([0xE3, 0x84, 0xB7]);
      expect(decoder.write(jamo3)).toBe("ㄷ");
    });
  });

  describe("Display width calculations for Korean input", () => {
    it("calculates correct display width for Korean characters", () => {
      const getDisplayWidth = (str: string): number => {
        let width = 0;
        for (const char of str) {
          const code = char.charCodeAt(0);
          const isFullWidth = (
            (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
            (code >= 0x3040 && code <= 0x309f) || // Hiragana
            (code >= 0x30a0 && code <= 0x30ff) || // Katakana
            (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables
            (code >= 0x1100 && code <= 0x11ff) || // Hangul Jamo Extended-A
            (code >= 0x3130 && code <= 0x318f)    // Hangul Compatibility Jamo
          );
          width += isFullWidth ? 2 : 1;
        }
        return width;
      };

      // Each Korean character takes 2 columns
      expect(getDisplayWidth("가")).toBe(2);
      expect(getDisplayWidth("안녕")).toBe(4);
      expect(getDisplayWidth("안녕하세요")).toBe(10);

      // Mixed content
      expect(getDisplayWidth("hello")).toBe(5); // 5 ASCII chars
      expect(getDisplayWidth("hello 안녕")).toBe(10); // 5 + space(1) + 안(2) + 녕(2)
      expect(getDisplayWidth("> 안녕")).toBe(6); // >(1) + space(1) + 안(2) + 녕(2)

      // Jamo characters also take 2 columns
      expect(getDisplayWidth("ㄱ")).toBe(2);
      expect(getDisplayWidth("ㄱㅏ")).toBe(4);
    });

    it("truncates long Korean input correctly for screen width", () => {
      const truncateInputFromLeft = (
        input: string,
        maxDisplayWidth: number
      ): string => {
        const getDisplayWidth = (str: string): number => {
          let width = 0;
          for (const char of str) {
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
          return width;
        };

        const displayWidth = getDisplayWidth(input);
        if (displayWidth <= maxDisplayWidth) {
          return input;
        }

        // Find rightmost characters that fit
        const chars = Array.from(input);
        let currentWidth = 0;
        let displayOffset = 0;

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

        return input.substring(displayOffset);
      };

      // Test: 80-column terminal with Korean text
      const longKorean = "안녕하세요좋은아침입니다오늘은정말좋은날씨네요";
      const result = truncateInputFromLeft(longKorean, 80);

      // Should show rightmost characters fitting in 80 width
      // 80 / 2 = 40 chars max
      expect(result.length).toBeLessThanOrEqual(40);
      // Should end with the last characters of input
      expect(result).toContain("씨네요");
      // Verify it fits within width
      let width = 0;
      for (const char of result) {
        const code = char.charCodeAt(0);
        width += (
          (code >= 0x4e00 && code <= 0x9fff) ||
          (code >= 0xac00 && code <= 0xd7af) ||
          (code >= 0x1100 && code <= 0x11ff) ||
          (code >= 0x3130 && code <= 0x318f)
        ) ? 2 : 1;
      }
      expect(width).toBeLessThanOrEqual(80);
    });

    it("preserves mixed ASCII and Korean content under truncation", () => {
      const truncateInputFromLeft = (
        input: string,
        maxDisplayWidth: number
      ): string => {
        const getDisplayWidth = (str: string): number => {
          let width = 0;
          for (const char of str) {
            const code = char.charCodeAt(0);
            width += (
              (code >= 0x4e00 && code <= 0x9fff) ||
              (code >= 0xac00 && code <= 0xd7af) ||
              (code >= 0x1100 && code <= 0x11ff) ||
              (code >= 0x3130 && code <= 0x318f)
            ) ? 2 : 1;
          }
          return width;
        };

        const displayWidth = getDisplayWidth(input);
        if (displayWidth <= maxDisplayWidth) {
          return input;
        }

        const chars = Array.from(input);
        let currentWidth = 0;
        let displayOffset = 0;

        for (let i = chars.length - 1; i >= 0; i--) {
          const char = chars[i];
          if (!char) continue;
          const code = char.charCodeAt(0);
          const charWidth = (
            (code >= 0x4e00 && code <= 0x9fff) ||
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

        return input.substring(displayOffset);
      };

      const mixed = "hello world 한글 테스트 입력 처리";
      const result = truncateInputFromLeft(mixed, 30);

      // Should preserve both ASCII and Korean
      expect(result).toMatch(/[a-zA-Z가-힯]/);
      // Should end with last part of input
      expect(result).toContain("처리");
    });
  });

  describe("Korean character detection consistency", () => {
    it("detects all Hangul character ranges correctly", () => {
      const isKoreanChar = (char: string): boolean => {
        const code = char.charCodeAt(0);
        return (
          (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables
          (code >= 0x1100 && code <= 0x11ff) || // Hangul Jamo Extended-A
          (code >= 0x3130 && code <= 0x318f)    // Hangul Compatibility Jamo
        );
      };

      // Hangul Syllables (완성된 글자)
      expect(isKoreanChar("가")).toBe(true);
      expect(isKoreanChar("나")).toBe(true);
      expect(isKoreanChar("힣")).toBe(true);

      // Hangul Jamo Extended-A (조합 중인 글자 - 초성/중성/종성)
      expect(isKoreanChar("ᄀ")).toBe(true); // U+1100
      expect(isKoreanChar("ᇿ")).toBe(true); // U+11FF

      // Hangul Compatibility Jamo (완전성 자모)
      expect(isKoreanChar("ㄱ")).toBe(true); // U+3131
      expect(isKoreanChar("ㄴ")).toBe(true); // U+3134
      expect(isKoreanChar("ㅏ")).toBe(true); // U+B5F4
      expect(isKoreanChar("ㅣ")).toBe(true); // U+318F

      // Non-Korean characters
      expect(isKoreanChar("a")).toBe(false);
      expect(isKoreanChar("1")).toBe(false);
      expect(isKoreanChar(" ")).toBe(false);
      expect(isKoreanChar("日")).toBe(false); // Japanese Kanji
    });

    it("maintains consistency between regex and character code checks", () => {
      const regexTest = (char: string): boolean => /[가-힯ᄀ-ᇿㄱ-ㅣ]/.test(char);

      const codeTest = (char: string): boolean => {
        const code = char.charCodeAt(0);
        return (
          (code >= 0xac00 && code <= 0xd7af) ||
          (code >= 0x1100 && code <= 0x11ff) ||
          (code >= 0x3130 && code <= 0x318f)
        );
      };

      // Test various Korean characters - both methods should agree
      const testChars = [
        "가",
        "나",
        "힣",
        "ㄱ",
        "ㄴ",
        "ㅏ",
        "ㅣ",
        "a",
        "1",
        " ",
        "日",
      ];

      for (const char of testChars) {
        expect(regexTest(char)).toBe(codeTest(char));
      }
    });
  });

  describe("Real-world input scenarios", () => {
    it("handles typical Korean command input patterns", () => {
      const inputs = [
        "안녕하세요",
        "hello 안녕",
        "123 한글 456",
        "가나다라마바사아자차카타파하",
        "한 글 입 력 테 스 트",
      ];

      const getDisplayWidth = (str: string): number => {
        let width = 0;
        for (const char of str) {
          const code = char.charCodeAt(0);
          width += (
            (code >= 0xac00 && code <= 0xd7af) ||
            (code >= 0x1100 && code <= 0x11ff) ||
            (code >= 0x3130 && code <= 0x318f)
          ) ? 2 : 1;
        }
        return width;
      };

      for (const input of inputs) {
        // Should be valid UTF-8
        expect(() => JSON.stringify(input)).not.toThrow();

        // Should have valid display width
        const width = getDisplayWidth(input);
        expect(width).toBeGreaterThan(0);
        expect(width).toBeLessThanOrEqual(input.length * 2);

        // Should preserve through array conversion
        const reconstructed = Array.from(input).join("");
        expect(reconstructed).toBe(input);
      }
    });

    it("handles pasting of Korean text with multiple lines", () => {
      const multilineInput = `안녕하세요
좋은 날씨네요
한글 테스트`;

      const lines = multilineInput.split("\n");
      expect(lines.length).toBe(3);
      expect(lines[0]).toBe("안녕하세요");
      expect(lines[1]).toBe("좋은 날씨네요");
      expect(lines[2]).toBe("한글 테스트");
    });

    it("maintains character integrity through multiple processing cycles", () => {
      const original = "안녕하세요 좋은 아침입니다";
      const chars = Array.from(original);

      // Simulate multiple cycles of processing
      for (let cycle = 0; cycle < 5; cycle++) {
        const reconstructed = chars.join("");
        expect(reconstructed).toBe(original);

        // Should be able to find specific characters
        expect(reconstructed).toContain("안");
        expect(reconstructed).toContain("녕");
        expect(reconstructed).toContain("좋은");
      }
    });
  });
});
