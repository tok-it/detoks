import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyLayoutOverrides,
  computeShiftedOverrides,
  getEffectiveWeights,
  isEmptyOverrides,
  loadLayoutOverrides,
  parseLayoutCommand,
  resolveLayoutOverridesPath,
  saveLayoutOverrides,
  type RuntimeLayoutOverrides,
} from "../../../../../src/cli/tui/runtime-layout.js";
import { DEFAULT_LAYOUT_SCHEMA } from "../../../../../src/cli/tui/layout-manager.js";

describe("runtime-layout", () => {
  describe("isEmptyOverrides", () => {
    it("returns true when no weights set", () => {
      expect(isEmptyOverrides({})).toBe(true);
    });

    it("returns false when transcriptWeight set", () => {
      expect(isEmptyOverrides({ transcriptWeight: 5 })).toBe(false);
    });

    it("returns false when resultWeight set", () => {
      expect(isEmptyOverrides({ resultWeight: 2 })).toBe(false);
    });
  });

  describe("applyLayoutOverrides", () => {
    it("returns the schema unchanged when overrides are empty", () => {
      expect(applyLayoutOverrides(DEFAULT_LAYOUT_SCHEMA, {})).toBe(DEFAULT_LAYOUT_SCHEMA);
    });

    it("replaces transcript weight only", () => {
      const result = applyLayoutOverrides(DEFAULT_LAYOUT_SCHEMA, { transcriptWeight: 8 });
      const transcript = result.find((p) => p.id === "transcript");
      const resultPanel = result.find((p) => p.id === "result");
      expect(transcript?.weight).toBe(8);
      expect(resultPanel?.weight).toBe(3);
    });

    it("replaces both weights", () => {
      const result = applyLayoutOverrides(DEFAULT_LAYOUT_SCHEMA, {
        transcriptWeight: 5,
        resultWeight: 5,
      });
      expect(result.find((p) => p.id === "transcript")?.weight).toBe(5);
      expect(result.find((p) => p.id === "result")?.weight).toBe(5);
    });

    it("clamps below MIN_FLEX_WEIGHT (1)", () => {
      const result = applyLayoutOverrides(DEFAULT_LAYOUT_SCHEMA, {
        transcriptWeight: 0,
      });
      expect(result.find((p) => p.id === "transcript")?.weight).toBe(1);
    });

    it("clamps above MAX_FLEX_WEIGHT (99)", () => {
      const result = applyLayoutOverrides(DEFAULT_LAYOUT_SCHEMA, {
        transcriptWeight: 1000,
      });
      expect(result.find((p) => p.id === "transcript")?.weight).toBe(99);
    });

    it("does not touch panels that are not transcript/result", () => {
      const result = applyLayoutOverrides(DEFAULT_LAYOUT_SCHEMA, {
        transcriptWeight: 9,
      });
      expect(result.find((p) => p.id === "header")).toEqual(
        DEFAULT_LAYOUT_SCHEMA.find((p) => p.id === "header"),
      );
      expect(result.find((p) => p.id === "input")).toEqual(
        DEFAULT_LAYOUT_SCHEMA.find((p) => p.id === "input"),
      );
    });
  });

  describe("parseLayoutCommand", () => {
    it("returns show when no args", () => {
      expect(parseLayoutCommand([])).toEqual({ kind: "show" });
    });

    it("returns reset for 'reset' or 'default'", () => {
      expect(parseLayoutCommand(["reset"])).toEqual({ kind: "reset" });
      expect(parseLayoutCommand(["default"])).toEqual({ kind: "reset" });
      expect(parseLayoutCommand(["RESET"])).toEqual({ kind: "reset" });
    });

    it("returns shift +1 for '+' or 'up'", () => {
      expect(parseLayoutCommand(["+"])).toEqual({ kind: "shift", transcriptDelta: 1 });
      expect(parseLayoutCommand(["up"])).toEqual({ kind: "shift", transcriptDelta: 1 });
    });

    it("returns shift -1 for '-' or 'down'", () => {
      expect(parseLayoutCommand(["-"])).toEqual({ kind: "shift", transcriptDelta: -1 });
      expect(parseLayoutCommand(["down"])).toEqual({ kind: "shift", transcriptDelta: -1 });
    });

    it("parses transcript=N", () => {
      expect(parseLayoutCommand(["transcript=8"])).toEqual({
        kind: "set",
        transcriptWeight: 8,
      });
    });

    it("parses result=N", () => {
      expect(parseLayoutCommand(["result=4"])).toEqual({
        kind: "set",
        resultWeight: 4,
      });
    });

    it("parses combined transcript=N result=N", () => {
      expect(parseLayoutCommand(["transcript=8", "result=2"])).toEqual({
        kind: "set",
        transcriptWeight: 8,
        resultWeight: 2,
      });
    });

    it("accepts t/r short forms", () => {
      expect(parseLayoutCommand(["t=6", "r=4"])).toEqual({
        kind: "set",
        transcriptWeight: 6,
        resultWeight: 4,
      });
    });

    it("clamps invalid (negative/too large) values", () => {
      const r = parseLayoutCommand(["transcript=-5", "result=500"]);
      expect(r).toEqual({ kind: "set", transcriptWeight: 1, resultWeight: 99 });
    });

    it("returns unknown for unrecognized argument", () => {
      expect(parseLayoutCommand(["foobar"])).toEqual({ kind: "unknown", arg: "foobar" });
    });

    it("returns unknown when no key=value pairs match", () => {
      expect(parseLayoutCommand(["x=1"])).toEqual({ kind: "unknown", arg: "x=1" });
    });
  });

  describe("computeShiftedOverrides", () => {
    it("shifts toward transcript when delta is positive", () => {
      const r = computeShiftedOverrides({}, 1);
      expect(r).toEqual({ transcriptWeight: 8, resultWeight: 2 });
    });

    it("shifts toward result when delta is negative", () => {
      const r = computeShiftedOverrides({}, -1);
      expect(r).toEqual({ transcriptWeight: 6, resultWeight: 4 });
    });

    it("clamps to min (1)", () => {
      const r = computeShiftedOverrides({ transcriptWeight: 1, resultWeight: 99 }, -5);
      expect(r.transcriptWeight).toBe(1);
    });

    it("clamps to max (99)", () => {
      const r = computeShiftedOverrides({ transcriptWeight: 99, resultWeight: 1 }, 5);
      expect(r.transcriptWeight).toBe(99);
    });

    it("operates from current overrides, not defaults", () => {
      const r = computeShiftedOverrides({ transcriptWeight: 5, resultWeight: 5 }, 1);
      expect(r).toEqual({ transcriptWeight: 6, resultWeight: 4 });
    });

    it("accepts custom default fallback", () => {
      const r = computeShiftedOverrides({}, 1, { transcriptWeight: 4, resultWeight: 6 });
      expect(r).toEqual({ transcriptWeight: 5, resultWeight: 5 });
    });
  });

  describe("getEffectiveWeights", () => {
    it("falls back to default schema (7/3) when overrides empty", () => {
      expect(getEffectiveWeights({})).toEqual({ transcriptWeight: 7, resultWeight: 3 });
    });

    it("uses overrides when provided", () => {
      expect(getEffectiveWeights({ transcriptWeight: 8, resultWeight: 2 })).toEqual({
        transcriptWeight: 8,
        resultWeight: 2,
      });
    });

    it("mixes overrides with schema defaults when partial", () => {
      expect(getEffectiveWeights({ transcriptWeight: 9 })).toEqual({
        transcriptWeight: 9,
        resultWeight: 3,
      });
    });
  });

  describe("disk persistence", () => {
    let tempDir: string;
    let filePath: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), "detoks-layout-test-"));
      filePath = join(tempDir, "layout-overrides.json");
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it("loadLayoutOverrides returns empty object when file missing", async () => {
      expect(await loadLayoutOverrides(filePath)).toEqual({});
    });

    it("save then load round-trips", async () => {
      const overrides: RuntimeLayoutOverrides = { transcriptWeight: 6, resultWeight: 4 };
      await saveLayoutOverrides(filePath, overrides);
      expect(await loadLayoutOverrides(filePath)).toEqual(overrides);
    });

    it("clamps invalid stored values on load", async () => {
      await saveLayoutOverrides(filePath, { transcriptWeight: 200, resultWeight: -3 });
      const loaded = await loadLayoutOverrides(filePath);
      expect(loaded).toEqual({ transcriptWeight: 99, resultWeight: 1 });
    });

    it("returns empty object on malformed JSON", async () => {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(filePath, "not json {", "utf-8");
      expect(await loadLayoutOverrides(filePath)).toEqual({});
    });

    it("ignores non-numeric fields", async () => {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(
        filePath,
        JSON.stringify({ transcriptWeight: "eight", resultWeight: 5 }),
        "utf-8",
      );
      expect(await loadLayoutOverrides(filePath)).toEqual({ resultWeight: 5 });
    });

    it("saveLayoutOverrides creates parent directories", async () => {
      const nested = join(tempDir, "a/b/c/layout-overrides.json");
      await saveLayoutOverrides(nested, { transcriptWeight: 5 });
      expect(await loadLayoutOverrides(nested)).toEqual({ transcriptWeight: 5 });
    });
  });

  describe("resolveLayoutOverridesPath", () => {
    it("places file under projects/<workspace>/layout-overrides.json", () => {
      const path = resolveLayoutOverridesPath("/tmp/sample-cwd");
      expect(path).toMatch(/layout-overrides\.json$/);
      expect(path).toContain(".detoks/projects/");
    });
  });
});
