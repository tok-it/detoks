import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  formatTranscript,
  isAutoSaveEnabled,
  resolveTranscriptPath,
  saveTranscript,
} from "../../../../../src/cli/tui/transcript-export.js";
import type { PtyEvent, PtyTranscript } from "../../../../../src/integrations/subprocess/types.js";

const buildTranscript = (overrides: Partial<PtyTranscript> = {}): PtyTranscript => {
  const startTime = 1_000_000;
  return {
    events: [],
    startTime,
    endTime: startTime + 5_000,
    totalDuration: 5_000,
    timedOut: false,
    ...overrides,
  };
};

const event = (overrides: Partial<PtyEvent>): PtyEvent => ({
  type: "chunk",
  timestamp: 0,
  ...overrides,
});

describe("transcript-export", () => {
  describe("formatTranscript", () => {
    it("emits a header block with session/adapter/prompt/duration metadata", () => {
      const transcript = buildTranscript({ exitCode: 0 });
      const output = formatTranscript(transcript, {
        sessionId: "abc12345",
        adapter: "codex",
        prompt: "do the thing",
      });
      expect(output).toContain("# detoks adapter transcript");
      expect(output).toContain("# session: abc12345");
      expect(output).toContain("# adapter: codex");
      expect(output).toContain("# prompt: do the thing");
      expect(output).toContain("# duration: 5s");
      expect(output).toContain("# exit: 0");
      expect(output).toContain("# events: 0");
      expect(output).toContain("# ---");
    });

    it("formats stdout/stderr chunks with relative MM:SS.mmm timestamps and stream label", () => {
      const transcript = buildTranscript({
        events: [
          event({ timestamp: 1_000_000 + 1234, stream: "stdout", data: "hello\n" }),
          event({ timestamp: 1_000_000 + 2456, stream: "stderr", data: "warn message" }),
        ],
      });
      const output = formatTranscript(transcript, { sessionId: "x" });
      expect(output).toMatch(/\[00:01\.234\] stdout: hello/);
      expect(output).toMatch(/\[00:02\.456\] stderr: warn message/);
    });

    it("strips ANSI escape sequences from chunk payload", () => {
      const transcript = buildTranscript({
        events: [
          event({
            timestamp: 1_000_000,
            stream: "stdout",
            data: "[32mgreen[0m text",
          }),
        ],
      });
      const output = formatTranscript(transcript);
      expect(output).toContain("stdout: green text");
      expect(output).not.toContain("");
    });

    it("formats prompt/reply/exit/timeout/error event types", () => {
      const transcript = buildTranscript({
        events: [
          event({ type: "prompt", timestamp: 1_000_000, data: "Continue?" }),
          event({ type: "reply", timestamp: 1_000_100, data: "y" }),
          event({ type: "resize", timestamp: 1_000_200, columns: 80, rows: 24 }),
          event({ type: "exit", timestamp: 1_000_300, data: "0" }),
          event({ type: "timeout", timestamp: 1_000_400 }),
          event({ type: "error", timestamp: 1_000_500, data: "boom" }),
        ],
      });
      const output = formatTranscript(transcript);
      expect(output).toContain("PROMPT: Continue?");
      expect(output).toContain("REPLY: y");
      expect(output).toContain("RESIZE: 80x24");
      expect(output).toContain("EXIT: 0");
      expect(output).toContain("TIMEOUT");
      expect(output).toContain("ERROR: boom");
    });

    it("uses minutes-and-seconds format when duration exceeds 60s", () => {
      const transcript = buildTranscript({
        startTime: 0,
        endTime: 125_000,
        totalDuration: 125_000,
      });
      const output = formatTranscript(transcript);
      expect(output).toContain("# duration: 2m 5s");
    });

    it("includes timed_out marker when transcript timed out", () => {
      const transcript = buildTranscript({ timedOut: true });
      const output = formatTranscript(transcript);
      expect(output).toContain("# timed_out: true");
    });
  });

  describe("resolveTranscriptPath", () => {
    it("places file under projects/<workspace>/transcripts/ with sortable timestamp", () => {
      const fixedNow = () => new Date("2026-05-16T01:23:45.678Z");
      const path = resolveTranscriptPath({
        cwd: "/tmp/sample-cwd",
        sessionId: "abcdef1234567890",
        runIndex: 2,
        now: fixedNow,
      });
      expect(path).toMatch(/transcripts\/20260516-012345-678-abcdef123456-r2\.txt$/);
      expect(path).toContain(".detoks/projects/");
    });

    it("works without sessionId or runIndex", () => {
      const fixedNow = () => new Date("2026-05-16T00:00:00.000Z");
      const path = resolveTranscriptPath({ cwd: "/tmp", now: fixedNow });
      expect(path).toMatch(/transcripts\/20260516-000000-000\.txt$/);
    });

    it("sanitizes sessionId for safe filename usage", () => {
      const fixedNow = () => new Date("2026-05-16T00:00:00.000Z");
      const path = resolveTranscriptPath({
        cwd: "/tmp",
        sessionId: "weird/sess id*123",
        now: fixedNow,
      });
      // After sanitization, slash/space/star become "-".
      expect(path).toMatch(/-weird-sess/);
      expect(path).not.toContain("/weird/sess");
    });
  });

  describe("saveTranscript", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), "detoks-transcript-test-"));
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it("creates parent directory and writes file content", async () => {
      const filePath = join(tempDir, "nested/dir/transcript.txt");
      await saveTranscript(filePath, "hello world\n");
      const written = await readFile(filePath, "utf-8");
      expect(written).toBe("hello world\n");
    });

    it("overwrites existing file on subsequent saves", async () => {
      const filePath = join(tempDir, "transcript.txt");
      await saveTranscript(filePath, "first");
      await saveTranscript(filePath, "second");
      expect(await readFile(filePath, "utf-8")).toBe("second");
    });

    it("creates nested directories as needed", async () => {
      const filePath = join(tempDir, "a/b/c/d/file.txt");
      await saveTranscript(filePath, "x");
      expect(dirname(filePath)).toContain("a/b/c/d");
      expect(await readFile(filePath, "utf-8")).toBe("x");
    });
  });

  describe("isAutoSaveEnabled", () => {
    let originalEnv: string | undefined;

    beforeEach(() => {
      originalEnv = process.env.DETOKS_SAVE_TRANSCRIPTS;
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.DETOKS_SAVE_TRANSCRIPTS;
      } else {
        process.env.DETOKS_SAVE_TRANSCRIPTS = originalEnv;
      }
    });

    it("returns true only when env is exactly '1'", () => {
      process.env.DETOKS_SAVE_TRANSCRIPTS = "1";
      expect(isAutoSaveEnabled()).toBe(true);

      process.env.DETOKS_SAVE_TRANSCRIPTS = "true";
      expect(isAutoSaveEnabled()).toBe(false);

      process.env.DETOKS_SAVE_TRANSCRIPTS = "0";
      expect(isAutoSaveEnabled()).toBe(false);

      delete process.env.DETOKS_SAVE_TRANSCRIPTS;
      expect(isAutoSaveEnabled()).toBe(false);
    });
  });
});
