import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyTheme,
  getActiveTheme,
  glyph,
  isThemeName,
  resolveActiveTheme,
  spacing,
  statusColor,
  themes,
  width,
  type ThemePalette,
} from "../../../../../../src/cli/tui/design/tokens.js";

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

  describe("theme system (P3-2)", () => {
    const PALETTE_KEYS: Array<keyof ThemePalette> = [
      "success", "pipelineDone", "warn", "error", "info", "muted",
      "accent", "pending", "active", "title", "header", "strong",
      "footer", "plain",
    ];

    let originalTheme: ThemePalette;
    let originalEnv: string | undefined;

    beforeEach(() => {
      originalTheme = getActiveTheme();
      originalEnv = process.env.DETOKS_THEME;
    });

    afterEach(() => {
      applyTheme(originalTheme);
      if (originalEnv === undefined) {
        delete process.env.DETOKS_THEME;
      } else {
        process.env.DETOKS_THEME = originalEnv;
      }
    });

    it("exposes 3 built-in palettes (dark, light, colorblind)", () => {
      expect(Object.keys(themes).sort()).toEqual(["colorblind", "dark", "light"]);
    });

    it("every palette implements all 14 semantic slots as functions", () => {
      for (const [name, palette] of Object.entries(themes)) {
        for (const key of PALETTE_KEYS) {
          expect(typeof palette[key]).toBe("function");
          // sanity: applying to text returns a string containing the input
          expect(palette[key]("z")).toContain("z");
          void name;
        }
      }
    });

    it("isThemeName accepts known names and rejects unknown", () => {
      expect(isThemeName("dark")).toBe(true);
      expect(isThemeName("light")).toBe(true);
      expect(isThemeName("colorblind")).toBe(true);
      expect(isThemeName("DARK")).toBe(false);
      expect(isThemeName("solarized")).toBe(false);
      expect(isThemeName("")).toBe(false);
    });

    it("resolveActiveTheme reads DETOKS_THEME env var", () => {
      process.env.DETOKS_THEME = "light";
      expect(resolveActiveTheme()).toBe(themes.light);
      process.env.DETOKS_THEME = "colorblind";
      expect(resolveActiveTheme()).toBe(themes.colorblind);
    });

    it("resolveActiveTheme is case-insensitive and trims whitespace", () => {
      process.env.DETOKS_THEME = "  Light  ";
      expect(resolveActiveTheme()).toBe(themes.light);
    });

    it("resolveActiveTheme defaults to dark on missing or invalid env", () => {
      delete process.env.DETOKS_THEME;
      expect(resolveActiveTheme()).toBe(themes.dark);
      process.env.DETOKS_THEME = "solarized";
      expect(resolveActiveTheme()).toBe(themes.dark);
    });

    it("applyTheme switches active palette so statusColor delegates to it", () => {
      // Sentinel palette where every style wraps text in unique markers.
      const sentinel: ThemePalette = {} as ThemePalette;
      for (const key of PALETTE_KEYS) {
        sentinel[key] = ((text: string) => `<${key}>${text}</${key}>`) as ThemePalette[typeof key];
      }
      applyTheme(sentinel);
      expect(statusColor.success("hi")).toBe("<success>hi</success>");
      expect(statusColor.pipelineDone("ok")).toBe("<pipelineDone>ok</pipelineDone>");
      expect(statusColor.error("x")).toBe("<error>x</error>");
    });

    it("colorblind palette avoids the red/green pair", () => {
      // Render to a chunk with chalk.level forced — verify success/error
      // outputs differ from dark theme's red/green ANSI codes.
      const successOut = themes.colorblind.success("✓");
      const errorOut = themes.colorblind.error("✗");
      // Dark theme uses 32 (green) for success, 31 (red) for error.
      expect(successOut).not.toMatch(/\x1b\[32m/);
      expect(errorOut).not.toMatch(/\x1b\[31m/);
    });
  });
});
