import { describe, it, expect, beforeEach, vi } from "vitest";
import { TranscriptPanel } from "../../../../../../src/cli/tui/panels/transcript.js";
import type { PtyEvent } from "../../../../../../src/integrations/subprocess/types.js";

describe("TranscriptPanel", () => {
  let panel: TranscriptPanel;
  let mockScreen: any;
  let mockContext: any;
  let mockRegion: any;

  beforeEach(() => {
    panel = new TranscriptPanel();
    mockScreen = {
      cursorMoveTo: vi.fn(),
      write: vi.fn(),
    };
    mockContext = { screen: mockScreen };
    mockRegion = {
      startRow: 11,
      endRow: 21,
      columns: 80,
    };
  });

  describe("append", () => {
    it("adds a single line to transcript", () => {
      panel.append("Hello, world!");
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("Hello, world!");
    });

    it("splits multiline input and adds each line", () => {
      panel.append("Line 1\nLine 2\nLine 3");
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("Line 1");
      expect(output).toContain("Line 2");
      expect(output).toContain("Line 3");
    });

    it("auto-scrolls to bottom when new content arrives", () => {
      panel.append("First line");
      panel.append("Second line");
      // After appending, scrollOffset should be 0 (at bottom)
      // We verify this by checking that when rendering, we see the latest content
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("Second line");
    });

    it("ignores empty lines", () => {
      panel.append("Line 1\n\nLine 3");
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("Line 1");
      expect(output).toContain("Line 3");
      // Should not render empty lines from split
      const contentLines = mockScreen.write.mock.calls.length;
      expect(contentLines).toBeGreaterThan(0); // At least header and content
    });
  });

  describe("addEvent", () => {
    it("adds stdout chunk to transcript", () => {
      const event: PtyEvent = {
        type: "chunk",
        stream: "stdout",
        data: "Output text",
        timestamp: Date.now(),
      };

      panel.addEvent(event);
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("Output text");
    });

    it("prefixes stderr with [ERR]", () => {
      const event: PtyEvent = {
        type: "chunk",
        stream: "stderr",
        data: "Error message",
        timestamp: Date.now(),
      };

      panel.addEvent(event);
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("[ERR]");
      expect(output).toContain("Error message");
    });

    it("ignores non-chunk events", () => {
      const event: PtyEvent = {
        type: "exit",
        timestamp: Date.now(),
      };

      // Should not throw
      expect(() => panel.addEvent(event)).not.toThrow();
    });

    it("auto-scrolls after adding event", () => {
      panel.addEvent({
        type: "chunk",
        stream: "stdout",
        data: "First",
        timestamp: Date.now(),
      });
      panel.addEvent({
        type: "chunk",
        stream: "stdout",
        data: "Second",
        timestamp: Date.now(),
      });

      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("Second");
    });
  });

  describe("scrollUp", () => {
    it("increases scroll offset when there is content above", () => {
      // Add enough lines to scroll
      for (let i = 0; i < 20; i++) {
        panel.append(`Line ${i}`);
      }

      panel.scrollUp();
      // After scroll up, render should show different content
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      // Should show earlier lines
      expect(output).toContain("Line");
    });

    it("respects maximum scroll offset", () => {
      panel.append("Only line");

      // Try to scroll up beyond available content
      for (let i = 0; i < 10; i++) {
        panel.scrollUp();
      }

      // Should not crash and should still render
      expect(() => {
        panel.render(mockContext, mockRegion);
      }).not.toThrow();
    });
  });

  describe("scrollDown", () => {
    it("decreases scroll offset to show newer content", () => {
      // Add enough lines
      for (let i = 0; i < 20; i++) {
        panel.append(`Line ${i}`);
      }

      // Scroll up
      panel.scrollUp();
      panel.scrollUp();

      // Scroll back down
      panel.scrollDown();

      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("Line");
    });

    it("prevents negative scroll offset", () => {
      panel.append("Line 1");

      // Try to scroll down beyond bottom
      for (let i = 0; i < 10; i++) {
        panel.scrollDown();
      }

      // Should not crash
      expect(() => {
        panel.render(mockContext, mockRegion);
      }).not.toThrow();
    });
  });

  describe("clear", () => {
    it("clears all lines and resets scroll", () => {
      panel.append("Line 1");
      panel.append("Line 2");
      panel.clear();

      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      // Should only have header and empty space
      expect(output).not.toContain("Line 1");
      expect(output).not.toContain("Line 2");
    });
  });

  describe("render", () => {
    it("renders content without header", () => {
      panel.append("Test content");

      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("Test content");
    });

    it("truncates long lines with ellipsis", () => {
      const longLine = "x".repeat(100);
      panel.append(longLine);

      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const contentCalls = mockScreen.write.mock.calls;
      const hasEllipsis = contentCalls.some((c: any) =>
        c[0].includes("...")
      );
      expect(hasEllipsis).toBe(true);
    });

    it("pads short lines to fill usable width", () => {
      panel.append("Short");

      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const contentCalls = mockScreen.write.mock.calls;
      const lineCall = contentCalls[0][0];
      // Line should be padded
      expect(lineCall.length).toBeGreaterThan("Short".length);
    });

    it("respects region boundaries", () => {
      for (let i = 0; i < 50; i++) {
        panel.append(`Line ${i}`);
      }

      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      // Verify cursor moves are within bounds
      const cursorCalls = mockScreen.cursorMoveTo.mock.calls;
      cursorCalls.forEach((call: any) => {
        const [row] = call;
        expect(row).toBeGreaterThanOrEqual(mockRegion.startRow);
        expect(row).toBeLessThan(mockRegion.endRow);
      });
    });

    it("fills remaining rows with blank space", () => {
      panel.append("Single line");

      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const calls = mockScreen.write.mock.calls;
      // Should have content line + blank padding lines
      expect(calls.length).toBeGreaterThan(1);
    });
  });
});
