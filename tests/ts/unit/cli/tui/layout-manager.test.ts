import { describe, it, expect } from "vitest";
import { computeLayout, getPanelHeight, getContentArea } from "../../../../../src/cli/tui/layout-manager.js";

describe("layout-manager", () => {
  describe("computeLayout", () => {
    it("allocates space correctly for a standard 24x80 terminal", () => {
      const layout = computeLayout({ rows: 24, columns: 80 });

      expect(layout.rows).toBe(24);
      expect(layout.columns).toBe(80);

      // Header should be 3 rows (0-2)
      expect(layout.headerRegion.startRow).toBe(0);
      expect(layout.headerRegion.endRow).toBe(3);

      // Status panel should be 8 rows
      expect(layout.statusPanelRegion.startRow).toBe(3);
      expect(layout.statusPanelRegion.endRow).toBe(11);

      // Input region should be 3 rows at the bottom
      expect(layout.inputRegion.startRow).toBe(21);
      expect(layout.inputRegion.endRow).toBe(24);

      // Transcript and result should fill the gap
      expect(layout.transcriptRegion.startRow).toBe(11);
      expect(layout.resultRegion.startRow).toBe(layout.transcriptRegion.endRow);
      expect(layout.resultRegion.endRow).toBe(21);
    });

    it("allocates transcript 70% and result 30% of available space", () => {
      const layout = computeLayout({ rows: 24, columns: 80 });

      const availableHeight = layout.inputRegion.startRow - layout.statusPanelRegion.endRow;
      const transcriptHeight = layout.transcriptRegion.endRow - layout.transcriptRegion.startRow;
      const resultHeight = layout.resultRegion.endRow - layout.resultRegion.startRow;

      const transcriptPercent = transcriptHeight / availableHeight;
      const resultPercent = resultHeight / availableHeight;

      expect(transcriptPercent).toBeCloseTo(0.7, 1);
      expect(resultPercent).toBeCloseTo(0.3, 1);
    });

    it("ensures transcript has minimum height", () => {
      const layout = computeLayout({ rows: 24, columns: 80 });
      const transcriptHeight = layout.transcriptRegion.endRow - layout.transcriptRegion.startRow;
      expect(transcriptHeight).toBeGreaterThanOrEqual(5);
    });

    it("handles large terminal (50x200)", () => {
      const layout = computeLayout({ rows: 50, columns: 200 });

      expect(layout.rows).toBe(50);
      expect(layout.columns).toBe(200);
      expect(layout.inputRegion.startRow).toBe(47);
      expect(layout.inputRegion.endRow).toBe(50);

      const allRegions = [
        layout.headerRegion,
        layout.statusPanelRegion,
        layout.transcriptRegion,
        layout.resultRegion,
        layout.inputRegion,
      ];

      // Verify no gaps or overlaps
      for (let i = 0; i < allRegions.length - 1; i++) {
        const current = allRegions[i];
        const next = allRegions[i + 1];
        expect(current!.endRow).toBe(next!.startRow);
      }
    });

    it("handles minimal terminal (10x40)", () => {
      const layout = computeLayout({ rows: 10, columns: 40 });

      expect(layout.rows).toBe(10);
      expect(layout.columns).toBe(40);

      // Should still allocate all regions
      expect(layout.headerRegion.endRow).toBe(3);
      expect(layout.statusPanelRegion.startRow).toBe(3);
      expect(layout.inputRegion.startRow).toBe(7);
      expect(layout.inputRegion.endRow).toBe(10);
    });
  });

  describe("getPanelHeight", () => {
    it("calculates height as difference between endRow and startRow", () => {
      const region = { startRow: 5, endRow: 15, columns: 80 };
      expect(getPanelHeight(region)).toBe(10);
    });

    it("returns 0 for zero-height region", () => {
      const region = { startRow: 5, endRow: 5, columns: 80 };
      expect(getPanelHeight(region)).toBe(0);
    });
  });

  describe("getContentArea", () => {
    it("uses the full region width for pane content", () => {
      const region = { startRow: 0, endRow: 10, columns: 80 };
      const { usableWidth } = getContentArea(region);
      expect(usableWidth).toBe(80);
    });

    it("uses the full region height for pane content", () => {
      const region = { startRow: 0, endRow: 10, columns: 80 };
      const { usableHeight } = getContentArea(region);
      expect(usableHeight).toBe(10);
    });

    it("returns the raw dimensions even for a very small region", () => {
      const region = { startRow: 0, endRow: 1, columns: 2 };
      const { usableWidth, usableHeight } = getContentArea(region);
      expect(usableWidth).toBe(2);
      expect(usableHeight).toBe(1);
    });
  });
});
