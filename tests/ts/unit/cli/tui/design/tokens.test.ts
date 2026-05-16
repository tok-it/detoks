import { describe, expect, it } from "vitest";
import { glyph, spacing, statusColor, width } from "../../../../../../src/cli/tui/design/tokens.js";

describe("design tokens", () => {
  describe("statusColor", () => {
    it("exposes semantic style functions", () => {
      const keys = [
        "success",
        "pipelineDone",
        "warn",
        "error",
        "info",
        "muted",
        "accent",
        "pending",
        "active",
        "title",
        "header",
        "strong",
        "footer",
        "plain",
      ] as const;
      for (const key of keys) {
        expect(typeof statusColor[key]).toBe("function");
        const out = statusColor[key]("x");
        expect(typeof out).toBe("string");
        // Plain is identity; others may add ANSI escapes but must preserve content.
        expect(out).toContain("x");
      }
    });

    it("plain style returns its input unchanged", () => {
      expect(statusColor.plain("hello")).toBe("hello");
    });
  });

  describe("glyph", () => {
    it("provides expected single-character markers", () => {
      expect(glyph.active).toBe("●");
      expect(glyph.skipped).toBe("○");
      expect(glyph.success).toBe("✓");
      expect(glyph.failure).toBe("✗");
      expect(glyph.selected).toBe("▶");
      expect(glyph.separator).toBe("━");
      expect(glyph.ellipsisOneChar).toBe("…");
      expect(glyph.ellipsisThreeDot).toBe("...");
    });

    it("provides a non-empty spinner frame array", () => {
      expect(glyph.spinner.length).toBeGreaterThan(0);
      for (const frame of glyph.spinner) {
        expect(typeof frame).toBe("string");
      }
    });

    it("provides cache + RAG markers for upcoming P1 panels", () => {
      expect(glyph.cacheHit).toBe("▣");
      expect(glyph.cacheMiss).toBe("▢");
      expect(glyph.cacheAdvise).toBe("⚠");
      expect(glyph.ragInjected).toBe("ⓘ");
      expect(glyph.ragSkipped).toBe("○");
    });
  });

  describe("spacing & width", () => {
    it("exposes positive layout constants", () => {
      expect(spacing.headerRows).toBeGreaterThan(0);
      expect(spacing.inputRows).toBeGreaterThan(0);
      expect(width.cjkCharCells).toBe(2);
      expect(width.asciiCharCells).toBe(1);
      expect(width.spinnerFrameMs).toBeGreaterThan(0);
    });
  });
});
