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

  it("toggles cursor visibility with show and hide cursor sequences", () => {
    const buffer = new TerminalEmulatorBuffer(6, 3);
    expect(buffer.snapshot().cursorVisible).toBe(true);

    buffer.write("\u001b[?25l");
    expect(buffer.snapshot().cursorVisible).toBe(false);

    buffer.write("\u001b[?25h");
    expect(buffer.snapshot().cursorVisible).toBe(true);
  });

  it("saves and restores the cursor with both CSI and legacy escape sequences", () => {
    const csiBuffer = new TerminalEmulatorBuffer(6, 3);
    csiBuffer.write("abc\u001b[s\u001b[1DZ\u001b[uQ");

    const csiSnapshot = csiBuffer.snapshot();
    expect(csiSnapshot.visibleRows[0]?.trim()).toBe("abZQ");

    const legacyBuffer = new TerminalEmulatorBuffer(6, 3);
    legacyBuffer.write("abc\u001b7\u001b[1DZ\u001b8Q");

    const legacySnapshot = legacyBuffer.snapshot();
    expect(legacySnapshot.visibleRows[0]?.trim()).toBe("abZQ");
  });

  it("supports insert and delete line sequences", () => {
    const insertBuffer = new TerminalEmulatorBuffer(6, 4);
    insertBuffer.write("row1\nrow2\nrow3");
    insertBuffer.write("\u001b[2;1H\u001b[1L");

    const insertSnapshot = insertBuffer.snapshot();
    expect(insertSnapshot.visibleRows[0]?.trim()).toBe("row1");
    expect(insertSnapshot.visibleRows[1]?.trim()).toBe("");
    expect(insertSnapshot.visibleRows[2]?.trim()).toBe("row2");
    expect(insertSnapshot.visibleRows[3]?.trim()).toBe("row3");

    const deleteBuffer = new TerminalEmulatorBuffer(6, 4);
    deleteBuffer.write("row1\nrow2\nrow3\nrow4");
    deleteBuffer.write("\u001b[2;1H\u001b[1M");

    const deleteSnapshot = deleteBuffer.snapshot();
    expect(deleteSnapshot.visibleRows[0]?.trim()).toBe("row1");
    expect(deleteSnapshot.visibleRows[1]?.trim()).toBe("row3");
    expect(deleteSnapshot.visibleRows[2]?.trim()).toBe("row4");
    expect(deleteSnapshot.visibleRows[3]?.trim()).toBe("");
  });

  it("supports insert and delete character sequences", () => {
    const insertBuffer = new TerminalEmulatorBuffer(6, 3);
    insertBuffer.write("abcd");
    insertBuffer.write("\u001b[2G\u001b[1@X");

    const insertSnapshot = insertBuffer.snapshot();
    expect(insertSnapshot.visibleRows[0]?.trim()).toBe("aXbcd");

    const deleteBuffer = new TerminalEmulatorBuffer(6, 3);
    deleteBuffer.write("abcd");
    deleteBuffer.write("\u001b[2G\u001b[1P");

    const deleteSnapshot = deleteBuffer.snapshot();
    expect(deleteSnapshot.visibleRows[0]?.trim()).toBe("acd");
  });

  it("supports scroll up and down sequences", () => {
    const scrollUpBuffer = new TerminalEmulatorBuffer(6, 4);
    scrollUpBuffer.write("row1\nrow2\nrow3\nrow4");
    scrollUpBuffer.write("\u001b[1;1H\u001b[1S");

    const scrollUpSnapshot = scrollUpBuffer.snapshot();
    expect(scrollUpSnapshot.visibleRows[0]?.trim()).toBe("row2");
    expect(scrollUpSnapshot.visibleRows[1]?.trim()).toBe("row3");
    expect(scrollUpSnapshot.visibleRows[2]?.trim()).toBe("row4");
    expect(scrollUpSnapshot.visibleRows[3]?.trim()).toBe("");
    expect(scrollUpSnapshot.scrollbackRows[0]?.trim()).toBe("row1");

    const scrollDownBuffer = new TerminalEmulatorBuffer(6, 4);
    scrollDownBuffer.write("row1\nrow2\nrow3");
    scrollDownBuffer.write("\u001b[1;1H\u001b[1T");

    const scrollDownSnapshot = scrollDownBuffer.snapshot();
    expect(scrollDownSnapshot.visibleRows[0]?.trim()).toBe("");
    expect(scrollDownSnapshot.visibleRows[1]?.trim()).toBe("row1");
    expect(scrollDownSnapshot.visibleRows[2]?.trim()).toBe("row2");
    expect(scrollDownSnapshot.visibleRows[3]?.trim()).toBe("row3");
  });

  it("consumes OSC, DCS, and charset sequences without leaking text", () => {
    const buffer = new TerminalEmulatorBuffer(12, 3);
    buffer.write("pre\u001b]0;title\u0007mid\u001bPpayload\u001b\\post\u001b(B!");

    const snapshot = buffer.snapshot();
    expect(snapshot.visibleRows[0]?.trim()).toBe("premidpost!");
  });

  it("treats combining marks as zero-width and emoji as double-width", () => {
    const buffer = new TerminalEmulatorBuffer(8, 3);
    buffer.write("a\u0301🚀b");

    const snapshot = buffer.snapshot();
    expect(snapshot.visibleRows[0]?.trim()).toBe("á🚀 b");
    expect(snapshot.cursorColumn).toBe(4);
  });

  it("keeps mixed-width wrapping stable across line boundaries", () => {
    const buffer = new TerminalEmulatorBuffer(3, 3);
    buffer.write("a\u0301🚀c");

    const snapshot = buffer.snapshot();
    expect(snapshot.visibleRows[0]?.trim()).toBe("á🚀");
    expect(snapshot.visibleRows[1]?.trim()).toBe("c");
  });

  it("reflows existing rows when the terminal narrows", () => {
    const buffer = new TerminalEmulatorBuffer(4, 2);
    buffer.write("abcd\nefgh");
    buffer.resize(2, 4);

    const snapshot = buffer.snapshot();
    expect(snapshot.visibleRows[0]?.trim()).toBe("ab");
    expect(snapshot.visibleRows[1]?.trim()).toBe("cd");
    expect(snapshot.visibleRows[2]?.trim()).toBe("ef");
    expect(snapshot.visibleRows[3]?.trim()).toBe("gh");
  });

  it("reflows scrollback rows when the terminal narrows", () => {
    const buffer = new TerminalEmulatorBuffer(4, 2);
    buffer.write("abcd\nefgh\nijkl");
    const beforeResize = buffer.snapshot();
    expect(beforeResize.scrollbackRows[0]?.trim()).toBe("abcd");

    buffer.resize(2, 4);

    const snapshot = buffer.snapshot();
    expect(snapshot.scrollbackRows[0]?.trim()).toBe("ab");
    expect(snapshot.scrollbackRows[1]?.trim()).toBe("cd");
  });
});
