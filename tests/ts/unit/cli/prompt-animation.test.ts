import { describe, expect, it } from "vitest";
import { buildPromptText } from "../../../../src/cli/interactive/prompt-builder.js";
import {
  buildCenteredTuiEntryFrame,
  buildPromptBootFrames,
  buildTuiEntryBootFrames,
} from "../../../../src/cli/interactive/prompt-animation.js";

const stripAnsi = (value: string): string => value.replace(/\u001b\[[0-9;]*m/g, "");
const countAnsiSequences = (value: string): number => (value.match(/\u001b\[[0-9;]*m/g) ?? []).length;

describe("prompt boot animation", () => {
  it("builds the plain prompt text used for the intro", () => {
    expect(
      buildPromptText({
        adapter: "codex",
        adapterModel: "gpt-5.4-mini",
        translationModel: "claude-3.5-sonnet",
      }),
    ).toBe("[CODEX:gpt-5.4-mini] detoks> ");
  });

  it("types detoks first and then runs the pacman track to the right", () => {
    const frames = buildPromptBootFrames({
      adapter: "codex",
      adapterModel: "gpt-5.4-mini",
      translationModel: "claude-3.5-sonnet",
    }).map(stripAnsi);

    expect(frames).toHaveLength(12);
    expect(frames.slice(0, 7)).toEqual([
      "[CODEX:gpt-5.4-mini] d",
      "[CODEX:gpt-5.4-mini] de",
      "[CODEX:gpt-5.4-mini] det",
      "[CODEX:gpt-5.4-mini] deto",
      "[CODEX:gpt-5.4-mini] detok",
      "[CODEX:gpt-5.4-mini] detoks",
      "[CODEX:gpt-5.4-mini] detoks>",
    ]);
    expect(frames.slice(7)).toEqual([
      "[CODEX:gpt-5.4-mini] detoks> ᗧ • • • •",
      "[CODEX:gpt-5.4-mini] detoks>  O • • •",
      "[CODEX:gpt-5.4-mini] detoks>   ᗧ • •",
      "[CODEX:gpt-5.4-mini] detoks>    O •",
      "[CODEX:gpt-5.4-mini] detoks>     ᗧ",
    ]);
  });

  it("builds centered TUI intro frames without duplicating the prompt text", () => {
    const frames = buildTuiEntryBootFrames();
    const plainFrames = frames.map(stripAnsi);

    expect(frames).toHaveLength(13);
    expect(plainFrames.slice(0, 7)).toEqual([
      "d",
      "de",
      "det",
      "deto",
      "detok",
      "detoks",
      "detoks>",
    ]);
    expect(plainFrames.slice(7)).toEqual([
      "detoks> ᗧ • • • •",
      "detoks>  O • • •",
      "detoks>   ᗧ • •",
      "detoks>    O •",
      "detoks>     ᗧ",
      "detoks>      O",
    ]);

    expect(countAnsiSequences(frames[7]!)).toBeGreaterThan(0);
    expect(countAnsiSequences(frames[8]!)).toBeGreaterThan(countAnsiSequences(frames[7]!));
    expect(countAnsiSequences(frames[12]!)).toBeGreaterThan(countAnsiSequences(frames[11]!));
  });

  it("keeps the completed prompt position fixed while the pacman advances", () => {
    const shortCentered = buildCenteredTuiEntryFrame("d", { rows: 24, columns: 80 });
    const fullCentered = buildCenteredTuiEntryFrame("detoks>", { rows: 24, columns: 80 });

    const shortLine = shortCentered.split("\n")[11];
    const fullLine = fullCentered.split("\n")[11];

    expect(shortCentered.split("\n").slice(0, 11)).toEqual(Array.from({ length: 11 }, () => ""));
    expect(fullCentered.split("\n").slice(0, 11)).toEqual(Array.from({ length: 11 }, () => ""));
    expect(shortLine).toBe(`${" ".repeat(36)}d`);
    expect(fullLine).toBe(`${" ".repeat(36)}detoks>`);
  });
});
