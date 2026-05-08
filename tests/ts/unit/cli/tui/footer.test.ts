import { describe, it, expect } from "vitest";
import { buildFooterText } from "../../../../../src/cli/tui/renderer.js";

describe("footer text", () => {
  const getDisplayWidth = (text: string): number => {
    let width = 0;
    for (const char of text) {
      const code = char.charCodeAt(0);
      const isWide = (
        (code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0x3040 && code <= 0x309f) ||
        (code >= 0x30a0 && code <= 0x30ff) ||
        (code >= 0xac00 && code <= 0xd7af) ||
        (code >= 0x1100 && code <= 0x11ff) ||
        (code >= 0x3130 && code <= 0x318f)
      );
      width += isWide ? 2 : 1;
    }
    return width;
  };

  it("shows only actual values when space is enough", () => {
    const footer = buildFooterText(120, {
      adapter: "codex",
      adapterModel: "gpt-5.4-mini",
      inferenceStrength: "medium",
      tokenSavings: "tok -18%",
      cwd: "/Users/choi/Desktop/workspace/detoks",
    });

    expect(footer.startsWith(" ")).toBe(true);
    expect(footer.endsWith(" ")).toBe(true);
    expect(footer.trim()).toBe(
      "codex | gpt-5.4-mini | medium | tok -18% | /Users/choi/Desktop/workspace/detoks",
    );
    expect(getDisplayWidth(footer)).toBe(120);
  });

  it("drops middle values before cwd when the footer is narrow", () => {
    const footer = buildFooterText(60, {
      adapter: "codex",
      adapterModel: "gpt-5.4-mini",
      inferenceStrength: "medium",
      tokenSavings: "tok -18%",
      cwd: "/Users/choi/Desktop/workspace/detoks",
    });

    expect(getDisplayWidth(footer)).toBe(60);
    expect(footer.startsWith(" ")).toBe(true);
    expect(footer.endsWith(" ")).toBe(true);
    expect(footer.trim()).toBe("codex | tok -18% | /Users/choi/Desktop/workspace/detoks");
  });
});
