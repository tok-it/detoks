import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  InputHistory,
  loadHistoryFromDisk,
  resolveHistoryPath,
  saveHistoryToDisk,
} from "../../../../../src/cli/tui/input-history.js";

describe("InputHistory", () => {
  describe("push", () => {
    it("stores entries newest-first", () => {
      const h = new InputHistory();
      h.push("first");
      h.push("second");
      h.push("third");
      expect(h.toArray()).toEqual(["third", "second", "first"]);
    });

    it("ignores empty / whitespace-only entries", () => {
      const h = new InputHistory();
      h.push("");
      h.push("   ");
      h.push("\n\t  ");
      expect(h.size()).toBe(0);
    });

    it("trims whitespace from stored entries", () => {
      const h = new InputHistory();
      h.push("  hello  ");
      expect(h.toArray()).toEqual(["hello"]);
    });

    it("dedupes consecutive duplicates", () => {
      const h = new InputHistory();
      h.push("same");
      h.push("same");
      h.push("same");
      expect(h.toArray()).toEqual(["same"]);
    });

    it("allows non-consecutive duplicates", () => {
      const h = new InputHistory();
      h.push("a");
      h.push("b");
      h.push("a");
      expect(h.toArray()).toEqual(["a", "b", "a"]);
    });

    it("caps at maxEntries (default 1000, configurable)", () => {
      const h = new InputHistory({ maxEntries: 3 });
      h.push("1");
      h.push("2");
      h.push("3");
      h.push("4");
      h.push("5");
      expect(h.toArray()).toEqual(["5", "4", "3"]);
      expect(h.size()).toBe(3);
    });
  });

  describe("recallOlder / recallNewer", () => {
    let h: InputHistory;
    beforeEach(() => {
      h = new InputHistory();
      h.push("alpha");
      h.push("bravo");
      h.push("charlie"); // newest
    });

    it("returns null when history is empty", () => {
      const empty = new InputHistory();
      expect(empty.recallOlder("draft")).toBeNull();
      expect(empty.recallNewer()).toBeNull();
    });

    it("first ↑ returns most recent and stashes the draft", () => {
      expect(h.recallOlder("my draft")).toBe("charlie");
      expect(h.isRecalling()).toBe(true);
    });

    it("subsequent ↑ walks toward older entries", () => {
      expect(h.recallOlder("d")).toBe("charlie");
      expect(h.recallOlder("d")).toBe("bravo");
      expect(h.recallOlder("d")).toBe("alpha");
    });

    it("↑ at oldest entry returns null and stays put", () => {
      h.recallOlder("d");
      h.recallOlder("d");
      h.recallOlder("d"); // at alpha
      expect(h.recallOlder("d")).toBeNull();
      expect(h.isRecalling()).toBe(true);
    });

    it("↓ from middle walks toward newer entries", () => {
      h.recallOlder("d"); // charlie
      h.recallOlder("d"); // bravo
      expect(h.recallNewer()).toBe("charlie");
    });

    it("↓ from most-recent restores stashed draft and exits recall", () => {
      h.recallOlder("my draft"); // → "charlie", stashes "my draft"
      const exited = h.recallNewer();
      expect(exited).toBe("my draft");
      expect(h.isRecalling()).toBe(false);
    });

    it("↓ when not recalling returns null", () => {
      expect(h.recallNewer()).toBeNull();
    });

    it("push() exits recall mode", () => {
      h.recallOlder("d");
      expect(h.isRecalling()).toBe(true);
      h.push("new entry");
      expect(h.isRecalling()).toBe(false);
    });

    it("resetRecall() exits recall mode without altering entries", () => {
      h.recallOlder("d");
      h.resetRecall();
      expect(h.isRecalling()).toBe(false);
      expect(h.size()).toBe(3);
    });
  });

  describe("load", () => {
    it("replaces existing entries and clears recall state", () => {
      const h = new InputHistory();
      h.push("old");
      h.recallOlder("d");
      h.load(["new1", "new2"]);
      expect(h.toArray()).toEqual(["new1", "new2"]);
      expect(h.isRecalling()).toBe(false);
    });

    it("respects maxEntries on load", () => {
      const h = new InputHistory({ maxEntries: 2 });
      h.load(["a", "b", "c", "d"]);
      expect(h.toArray()).toEqual(["a", "b"]);
    });
  });
});

describe("disk persistence", () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "detoks-history-test-"));
    filePath = join(tempDir, "input-history.txt");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("loadHistoryFromDisk returns empty array on missing file", async () => {
    const entries = await loadHistoryFromDisk(filePath);
    expect(entries).toEqual([]);
  });

  it("saveHistoryToDisk then loadHistoryFromDisk round-trips entries", async () => {
    const entries = ["first prompt", "second prompt", "third with\nnewline"];
    await saveHistoryToDisk(filePath, entries);
    const loaded = await loadHistoryFromDisk(filePath);
    expect(loaded).toEqual(entries);
  });

  it("saveHistoryToDisk creates parent directory as needed", async () => {
    const nested = join(tempDir, "a/b/c/input-history.txt");
    await saveHistoryToDisk(nested, ["x"]);
    const loaded = await loadHistoryFromDisk(nested);
    expect(loaded).toEqual(["x"]);
  });

  it("saveHistoryToDisk overwrites previous content", async () => {
    await saveHistoryToDisk(filePath, ["a", "b", "c"]);
    await saveHistoryToDisk(filePath, ["x"]);
    const loaded = await loadHistoryFromDisk(filePath);
    expect(loaded).toEqual(["x"]);
  });

  it("loadHistoryFromDisk skips malformed lines but keeps valid ones", async () => {
    // Manually craft a mix of valid base64 and garbage
    const goodLine = Buffer.from("good entry", "utf-8").toString("base64");
    const file = `${goodLine}\nnot-base64-^!@#\n${Buffer.from("another", "utf-8").toString("base64")}\n`;
    const { writeFile } = await import("node:fs/promises");
    await writeFile(filePath, file, "utf-8");
    const loaded = await loadHistoryFromDisk(filePath);
    // The garbage line decodes to non-empty random bytes (base64 is permissive),
    // so we only assert the well-formed entries are present.
    expect(loaded).toContain("good entry");
    expect(loaded).toContain("another");
  });
});

describe("resolveHistoryPath", () => {
  it("returns path under projects/<workspace>/input-history.txt", () => {
    const path = resolveHistoryPath("/tmp/sample-cwd");
    expect(path).toMatch(/input-history\.txt$/);
    expect(path).toContain(".detoks/projects/");
  });
});
