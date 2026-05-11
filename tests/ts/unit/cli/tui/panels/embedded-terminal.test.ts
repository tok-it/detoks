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
});
