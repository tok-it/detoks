import { describe, expect, it, beforeEach, vi } from "vitest";
import { EmbeddedTerminalPane } from "../../../../../../src/cli/tui/panels/embedded-terminal.js";

describe("EmbeddedTerminalPane", () => {
  let pane: EmbeddedTerminalPane;
  let mockScreen: any;
  let mockContext: any;
  let mockRegion: any;

  beforeEach(() => {
    pane = new EmbeddedTerminalPane();
    mockScreen = {
      cursorMoveTo: vi.fn(),
      write: vi.fn(),
    };
    mockContext = { screen: mockScreen };
    mockRegion = {
      startRow: 5,
      endRow: 10,
      columns: 20,
    };
  });

  it("renders an empty-state placeholder before output arrives", () => {
    pane.render(mockContext, mockRegion);

    const output = mockScreen.write.mock.calls.map((call: any) => call[0]).join("\n");
    expect(output).toContain("원본 CLI 출력");
  });

  it("renders chunk output into the pane", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "hello\nworld",
    });

    pane.render(mockContext, mockRegion);

    const output = mockScreen.write.mock.calls.map((call: any) => call[0]).join("\n");
    expect(output).toContain("hello");
    expect(output).toContain("world");
  });

  it("preserves ANSI style information in raw chunks passed to the buffer", () => {
    const ansiChunk = "\x1b[32mhello\x1b[0m world";
    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: ansiChunk });

    pane.render(mockContext, mockRegion);

    const output = mockScreen.write.mock.calls.map((call: any) => call[0]).join("\n");
    expect(output).toContain("\x1b[32m");
    expect(output).toContain("\x1b[0m");
    expect(output).toContain("hello");
    expect(output).toContain("world");
  });

  it("forwards resize events to the terminal buffer without writing content", () => {
    // Use a short string that fits within usableWidth (columns 20 - 4 border = 16)
    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: "output line" });

    // Resize event should update buffer dimensions, not add any text
    pane.addEvent({ type: "resize", timestamp: Date.now(), columns: 120, rows: 40 });

    pane.render(mockContext, mockRegion);

    const output = mockScreen.write.mock.calls.map((call: any) => call[0]).join("\n");
    expect(output).toContain("output line");
    // Resize event itself must not inject any visible text
    expect(mockScreen.write.mock.calls.some((call: any) => String(call[0]).includes("resize"))).toBe(false);
  });

  it("ignores non-chunk events other than resize", () => {
    pane.addEvent({ type: "exit", timestamp: Date.now(), data: "0" });

    pane.render(mockContext, mockRegion);

    const output = mockScreen.write.mock.calls.map((call: any) => call[0]).join("\n");
    expect(output).toContain("원본 CLI 출력"); // still empty-state
  });

  it("resets its buffer when cleared", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "hello",
    });

    pane.clear();
    pane.render(mockContext, mockRegion);

    const output = mockScreen.write.mock.calls.map((call: any) => call[0]).join("\n");
    expect(output).toContain("원본 CLI 출력");
    expect(output).not.toContain("hello");
  });

  it("scrollToBottom resets scroll offset to 0 and new data auto-resets scroll", () => {
    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: "line1\n" });
    pane.scrollUp();
    pane.scrollUp();
    pane.scrollToBottom();

    // After scrollToBottom, new data should still keep offset at 0
    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: "line2\n" });
    pane.render(mockContext, mockRegion);

    const output = mockScreen.write.mock.calls.map((call: any) => call[0]).join("\n");
    expect(output).toContain("line2");
  });

  it("scrollDown does not go below 0", () => {
    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: "line\n" });
    // scrollDown at bottom should be a no-op
    pane.scrollDown();
    pane.scrollDown();
    pane.render(mockContext, mockRegion);

    const output = mockScreen.write.mock.calls.map((call: any) => call[0]).join("\n");
    expect(output).toContain("line");
  });

  it("scrollUp clamps at total row count and does not crash on empty buffer", () => {
    // Scrolling on empty pane must not throw
    expect(() => {
      pane.scrollUp();
      pane.scrollUp();
      pane.render(mockContext, mockRegion);
    }).not.toThrow();
  });
});
