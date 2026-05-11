import { describe, expect, it } from "vitest";
import { TerminalEmulatorBuffer } from "../../../../../src/cli/tui/terminal-emulator.js";

describe("TerminalEmulatorBuffer", () => {
  it("writes plain text and wraps lines", () => {
    const buffer = new TerminalEmulatorBuffer(5, 3);
    buffer.write("hello\nworld");

    const snapshot = buffer.snapshot();
    expect(snapshot.visibleRows[0]?.trim()).toBe("hello");
    expect(snapshot.visibleRows[1]?.trim()).toBe("world");
  });

  it("handles cursor movement and overwrite sequences", () => {
    const buffer = new TerminalEmulatorBuffer(6, 3);
    buffer.write("abc\u001b[1DZ");

    const snapshot = buffer.snapshot();
    expect(snapshot.visibleRows[0]?.trim()).toBe("abZ");
  });

  it("clears the screen and resets the cursor", () => {
    const buffer = new TerminalEmulatorBuffer(6, 3);
    buffer.write("hello");
    buffer.write("\u001b[2J");

    const snapshot = buffer.snapshot();
    expect(snapshot.visibleRows[0]?.trim()).toBe("");
    expect(snapshot.cursorRow).toBe(0);
    expect(snapshot.cursorColumn).toBe(0);
  });

  it("switches to the alternate screen and restores the main screen", () => {
    const buffer = new TerminalEmulatorBuffer(6, 3);
    buffer.write("main");
    buffer.write("\u001b[?1049h");
    buffer.write("alt");
    expect(buffer.snapshot().alternateScreen).toBe(true);

    buffer.write("\u001b[?1049l");
    const snapshot = buffer.snapshot();
    expect(snapshot.alternateScreen).toBe(false);
    expect(snapshot.visibleRows[0]?.trim()).toBe("main");
  });
});
