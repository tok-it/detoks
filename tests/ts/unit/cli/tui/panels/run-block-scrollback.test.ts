import { describe, expect, it, beforeEach } from "vitest";
import { RunBlockScrollback } from "../../../../../../src/cli/tui/panels/run-block-scrollback.js";
import type { RunBlockEntry } from "../../../../../../src/cli/tui/panels/run-block-scrollback.js";

const WIDTH = 80;
const HEIGHT = 10;

const makeEntry = (
  index: number,
  overrides: Partial<RunBlockEntry> = {},
): RunBlockEntry => ({
  id: `run-${index}`,
  index,
  prompt: `prompt ${index}`,
  status: "completed",
  snapshotLines: [{ text: `output of run ${index}` }],
  ...overrides,
});

describe("RunBlockScrollback", () => {
  let sb: RunBlockScrollback;

  beforeEach(() => {
    sb = new RunBlockScrollback({ maxEntries: 5 });
  });

  describe("empty state", () => {
    it("returns a non-empty placeholder when there are no entries", () => {
      const lines = sb.getVisibleLines(WIDTH, HEIGHT);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.some((l) => l.text.length > 0)).toBe(true);
    });

    it("reports totalLines > 0 and pinnedToBottom=true for empty state", () => {
      const vp = sb.getViewport(WIDTH, HEIGHT);
      expect(vp.pinnedToBottom).toBe(true);
      expect(vp.totalLines).toBeGreaterThan(0);
    });
  });

  describe("single entry", () => {
    it("renders separator + snapshot lines", () => {
      sb.setEntries([makeEntry(1)]);
      const lines = sb.getVisibleLines(WIDTH, HEIGHT);
      // Separator must appear
      const hasSeparator = lines.some((l) => l.text.includes("#1"));
      expect(hasSeparator).toBe(true);
      // Snapshot line must appear
      const hasOutput = lines.some((l) => l.text.includes("output of run 1"));
      expect(hasOutput).toBe(true);
    });
  });

  describe("multiple entries", () => {
    it("renders separator for each entry in order", () => {
      sb.setEntries([makeEntry(1), makeEntry(2)]);
      const lines = sb.getVisibleLines(WIDTH, HEIGHT * 4);
      const sep1 = lines.findIndex((l) => l.text.includes("#1"));
      const sep2 = lines.findIndex((l) => l.text.includes("#2"));
      expect(sep1).toBeGreaterThanOrEqual(0);
      expect(sep2).toBeGreaterThan(sep1);
    });

    it("renders entry 1 content before entry 2 separator", () => {
      sb.setEntries([makeEntry(1), makeEntry(2)]);
      const lines = sb.getVisibleLines(WIDTH, HEIGHT * 4);
      const output1 = lines.findIndex((l) => l.text.includes("output of run 1"));
      const sep2 = lines.findIndex((l) => l.text.includes("#2"));
      expect(output1).toBeGreaterThanOrEqual(0);
      expect(sep2).toBeGreaterThan(output1);
    });
  });

  describe("scrolling", () => {
    it("pins to bottom by default", () => {
      sb.setEntries([makeEntry(1), makeEntry(2), makeEntry(3)]);
      const vp = sb.getViewport(WIDTH, HEIGHT);
      expect(vp.pinnedToBottom).toBe(true);
    });

    it("scrollBy(-N) moves up and unpins from bottom", () => {
      // Add enough lines to make scrolling meaningful
      const entries = Array.from({ length: 5 }, (_, i) => makeEntry(i + 1, {
        snapshotLines: Array.from({ length: 5 }, (__, j) => ({ text: `line ${i}-${j}` })),
      }));
      sb.setEntries(entries);
      sb.scrollBy(-3, HEIGHT, WIDTH);
      const vp = sb.getViewport(WIDTH, HEIGHT);
      expect(vp.pinnedToBottom).toBe(false);
      expect(vp.distanceFromBottom).toBe(3);
    });

    it("scrollToBottom restores pin", () => {
      const entries = Array.from({ length: 5 }, (_, i) => makeEntry(i + 1, {
        snapshotLines: Array.from({ length: 5 }, (__, j) => ({ text: `line ${i}-${j}` })),
      }));
      sb.setEntries(entries);
      sb.scrollBy(-5, HEIGHT, WIDTH);
      sb.scrollToBottom();
      const vp = sb.getViewport(WIDTH, HEIGHT);
      expect(vp.pinnedToBottom).toBe(true);
    });

    it("getVisibleLines clips to viewportHeight rows", () => {
      sb.setEntries([makeEntry(1), makeEntry(2), makeEntry(3)]);
      const lines = sb.getVisibleLines(WIDTH, HEIGHT);
      expect(lines.length).toBeLessThanOrEqual(HEIGHT);
    });

    it("scrollToTop then getVisibleLines shows first separator", () => {
      const entries = Array.from({ length: 3 }, (_, i) => makeEntry(i + 1, {
        snapshotLines: Array.from({ length: 10 }, (__, j) => ({ text: `body ${i} line ${j}` })),
      }));
      sb.setEntries(entries);
      sb.scrollToTop(WIDTH, HEIGHT);
      const lines = sb.getVisibleLines(WIDTH, HEIGHT);
      const hasSep1 = lines.some((l) => l.text.includes("#1"));
      expect(hasSep1).toBe(true);
    });
  });

  describe("maxEntries eviction", () => {
    it("evicts oldest entries beyond maxEntries", () => {
      sb = new RunBlockScrollback({ maxEntries: 3 });
      sb.setEntries([makeEntry(1), makeEntry(2), makeEntry(3), makeEntry(4), makeEntry(5)]);
      expect(sb.getEntryCount()).toBe(3);
    });

    it("addEntry evicts oldest when limit exceeded", () => {
      sb = new RunBlockScrollback({ maxEntries: 2 });
      sb.addEntry(makeEntry(1));
      sb.addEntry(makeEntry(2));
      sb.addEntry(makeEntry(3));
      expect(sb.getEntryCount()).toBe(2);
    });
  });

  describe("reset", () => {
    it("clears all entries and resets scroll", () => {
      sb.setEntries([makeEntry(1), makeEntry(2)]);
      sb.scrollBy(-5, HEIGHT, WIDTH);
      sb.reset();
      expect(sb.getEntryCount()).toBe(0);
      const vp = sb.getViewport(WIDTH, HEIGHT);
      expect(vp.pinnedToBottom).toBe(true);
    });
  });

  describe("status in separator", () => {
    it("shows completed glyph for completed entries", () => {
      sb.setEntries([makeEntry(1, { status: "completed" })]);
      const lines = sb.getVisibleLines(WIDTH, HEIGHT);
      const sep = lines.find((l) => l.text.includes("#1"));
      expect(sep?.text).toContain("✓");
    });

    it("shows failed glyph for failed entries", () => {
      sb.setEntries([makeEntry(1, { status: "failed" })]);
      const lines = sb.getVisibleLines(WIDTH, HEIGHT);
      const sep = lines.find((l) => l.text.includes("#1"));
      expect(sep?.text).toContain("✗");
    });
  });

  describe("live pane delegation", () => {
    it("uses snapshotLines for completed entries (no pane)", () => {
      sb.setEntries([makeEntry(1, { snapshotLines: [{ text: "snapped" }] })]);
      const lines = sb.getVisibleLines(WIDTH, HEIGHT);
      expect(lines.some((l) => l.text === "snapped")).toBe(true);
    });

    it("delegates to pane.getRenderableLines for active (no snapshot) entry", () => {
      const mockPane = {
        getRenderableLines: () => [{ text: "live output" }],
      } as unknown as import("../../../../../../src/cli/tui/panels/embedded-terminal.js").EmbeddedTerminalPane;

      sb.setEntries([{ id: "r1", index: 1, prompt: "p", status: "running", pane: mockPane }]);
      const lines = sb.getVisibleLines(WIDTH, HEIGHT);
      expect(lines.some((l) => l.text === "live output")).toBe(true);
    });
  });
});
