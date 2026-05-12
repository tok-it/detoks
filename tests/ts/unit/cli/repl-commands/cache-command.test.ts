import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  getCacheStats,
  clearExpiredSessions,
  formatCacheStats,
  type CacheStats,
} from "../../../../../src/cli/repl-commands/cache-command.js";

const SESSION_BASE: Record<string, unknown> = {
  session_id: "s1",
  completed_task_ids: ["t1"],
  task_results: {},
  updated_at: new Date().toISOString(),
  shared_context: {
    session_id: "s1",
    raw_input: "test",
    raw_input_hash: "abc123",
    project_id: "proj1",
    project_path: "/tmp/proj",
    project_name: "proj",
    failed_task_ids: [],
    token_metrics: {},
  },
};

function makeSession(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...SESSION_BASE, ...overrides });
}

describe("getCacheStats", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "detoks-cache-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns zero stats for empty directory", async () => {
    const stats = await getCacheStats(dir, 7);
    expect(stats.totalSessions).toBe(0);
    expect(stats.f1Eligible).toBe(0);
    expect(stats.f2Eligible).toBe(0);
    expect(stats.expiredSessions).toBe(0);
  });

  it("counts F1-eligible sessions (raw_input_hash present)", async () => {
    await writeFile(join(dir, "s1.json"), makeSession());
    await writeFile(join(dir, "s2.json"), makeSession({ shared_context: { ...SESSION_BASE.shared_context as object, raw_input_hash: undefined } }));

    const stats = await getCacheStats(dir, 7);
    expect(stats.totalSessions).toBe(2);
    expect(stats.f1Eligible).toBe(1);
  });

  it("counts F2-eligible task results (input_hash present)", async () => {
    const session = {
      ...SESSION_BASE,
      task_results: {
        t1: { input_hash: "h1", success: true, type: "create" },
        t2: { success: true, type: "execute" },
      },
    };
    await writeFile(join(dir, "s1.json"), JSON.stringify(session));

    const stats = await getCacheStats(dir, 7);
    expect(stats.f2Eligible).toBe(1);
  });

  it("counts expired sessions beyond TTL", async () => {
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await writeFile(join(dir, "old.json"), makeSession({ updated_at: oldDate }));
    await writeFile(join(dir, "new.json"), makeSession());

    const stats = await getCacheStats(dir, 7);
    expect(stats.expiredSessions).toBe(1);
  });

  it("ignores non-json files", async () => {
    await writeFile(join(dir, "s1.json"), makeSession());
    await writeFile(join(dir, "s1.json.lock"), "locked");
    await writeFile(join(dir, "s1.tmp.json"), makeSession());

    const stats = await getCacheStats(dir, 7);
    expect(stats.totalSessions).toBe(1);
  });
});

describe("clearExpiredSessions", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "detoks-cache-clear-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns 0 when no sessions exist", async () => {
    const count = await clearExpiredSessions(dir, 7);
    expect(count).toBe(0);
  });

  it("removes only expired sessions and returns count", async () => {
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    await writeFile(join(dir, "old1.json"), makeSession({ updated_at: oldDate }));
    await writeFile(join(dir, "old2.json"), makeSession({ updated_at: oldDate }));
    await writeFile(join(dir, "new.json"), makeSession());

    const count = await clearExpiredSessions(dir, 7);
    expect(count).toBe(2);
  });

  it("keeps valid sessions intact", async () => {
    await writeFile(join(dir, "s1.json"), makeSession());
    await clearExpiredSessions(dir, 7);
    const stats = await getCacheStats(dir, 7);
    expect(stats.totalSessions).toBe(1);
  });

  it("returns 0 if directory does not exist", async () => {
    const count = await clearExpiredSessions(join(dir, "nonexistent"), 7);
    expect(count).toBe(0);
  });
});

describe("formatCacheStats", () => {
  const stats: CacheStats = {
    totalSessions: 10,
    f1Eligible: 6,
    f2Eligible: 14,
    expiredSessions: 2,
    ttlDays: 7,
  };

  it("shows cache enabled status", () => {
    const out = formatCacheStats(stats, false);
    expect(out).toContain("활성");
    expect(out).toContain("10");
    expect(out).toContain("6");
    expect(out).toContain("14");
  });

  it("shows cache disabled status", () => {
    const out = formatCacheStats(stats, true);
    expect(out).toContain("비활성");
  });

  it("shows TTL info", () => {
    const out = formatCacheStats(stats, false);
    expect(out).toContain("7");
  });
});
