import { describe, expect, it } from "vitest";
import {
  computeEmbeddedTerminalPaneLayout,
  formatEmbeddedTerminalFocusHint,
  isEmbeddedTerminalPaneSupported,
} from "../../../../../src/cli/tui/embedded-terminal.js";

describe("embedded-terminal", () => {
  it("treats 80x24 as the minimum supported pane size", () => {
    expect(isEmbeddedTerminalPaneSupported(24, 80)).toBe(true);
    expect(isEmbeddedTerminalPaneSupported(23, 80)).toBe(false);
    expect(isEmbeddedTerminalPaneSupported(24, 79)).toBe(false);
  });

  it("computes a single-column layout with a large embedded pane", () => {
    const layout = computeEmbeddedTerminalPaneLayout(40, 120, true);

    expect(layout.supported).toBe(true);
    expect(layout.rows).toBe(40);
    expect(layout.columns).toBe(120);
    expect(layout.headerRegion.endRow).toBe(2);
    expect(layout.statusRegion.startRow).toBe(2);
    expect(layout.embeddedRegion.startRow).toBe(layout.statusRegion.endRow);
    expect(layout.summaryRegion.startRow).toBe(layout.embeddedRegion.endRow);
    expect(layout.footerRegion.endRow).toBe(40);
    expect(layout.embeddedRows).toBeGreaterThanOrEqual(8);
    expect(layout.summaryRows).toBeGreaterThanOrEqual(6);
  });

  it("uses a compact summary when the run has not completed yet", () => {
    const layout = computeEmbeddedTerminalPaneLayout(30, 100, false);

    expect(layout.supported).toBe(true);
    expect(layout.summaryRows).toBe(4);
    expect(layout.footerRegion.endRow).toBe(30);
  });

  it("returns a fallback reason for small terminals", () => {
    const layout = computeEmbeddedTerminalPaneLayout(20, 70, true);

    expect(layout.supported).toBe(false);
    expect(layout.fallbackReason).toContain("80x24");
  });

  it("formats focus hints for detoks and native adapter focus", () => {
    expect(formatEmbeddedTerminalFocusHint("detoks-input", "codex")).toContain("/ command autocomplete");
    expect(formatEmbeddedTerminalFocusHint("adapter-terminal", "codex")).toContain("Esc/Ctrl+G returns to detoks");
    expect(formatEmbeddedTerminalFocusHint("summary", "codex")).toContain("[summary]");
  });
});
