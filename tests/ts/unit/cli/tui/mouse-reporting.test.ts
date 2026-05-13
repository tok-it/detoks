import { describe, expect, it } from "vitest";
import {
  consumeMouseReportingInput,
  parseMouseWheelEvent,
} from "../../../../../src/cli/tui/mouse-reporting.js";

describe("mouse reporting", () => {
  it("parses sgr wheel-up events", () => {
    expect(parseMouseWheelEvent("\x1b[<64;12;8M")).toEqual({
      direction: "up",
      column: 12,
      row: 8,
      sequence: "\x1b[<64;12;8M",
    });
  });

  it("parses sgr wheel-down events", () => {
    expect(parseMouseWheelEvent("\x1b[<65;40;19Mrest")).toEqual({
      direction: "down",
      column: 40,
      row: 19,
      sequence: "\x1b[<65;40;19M",
    });
  });

  it("ignores non-wheel mouse events", () => {
    expect(parseMouseWheelEvent("\x1b[<0;12;8M")).toBeNull();
    expect(parseMouseWheelEvent("\x1b[<64;12;8m")).toBeNull();
    expect(parseMouseWheelEvent("plain text")).toBeNull();
  });

  it("consumes wheel sequences without leaking them into prompt text", () => {
    expect(consumeMouseReportingInput("abc\x1b[<64;12;8Mdef")).toEqual({
      cleanedText: "abcdef",
      pendingSequence: "",
      wheelEvents: [{
        direction: "up",
        column: 12,
        row: 8,
        sequence: "\x1b[<64;12;8M",
      }],
    });
  });

  it("buffers incomplete mouse sequences until the next chunk arrives", () => {
    const firstChunk = consumeMouseReportingInput("\x1b[<64;12");
    expect(firstChunk.cleanedText).toBe("");
    expect(firstChunk.pendingSequence).toBe("\x1b[<64;12");
    expect(firstChunk.wheelEvents).toHaveLength(0);

    const completed = consumeMouseReportingInput(`${firstChunk.pendingSequence};8Mrest`);
    expect(completed.pendingSequence).toBe("");
    expect(completed.cleanedText).toBe("rest");
    expect(completed.wheelEvents).toHaveLength(1);
    expect(completed.wheelEvents[0]?.direction).toBe("up");
  });
});
