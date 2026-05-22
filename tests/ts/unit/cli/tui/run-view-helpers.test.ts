import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatCacheHitBadge,
  formatTokenSavingsBadge,
  resolveFooterBranchLabel,
  truncateToDisplayWidth,
} from "../../../../../src/cli/tui/run-view-helpers.js";

describe("TUI run view helpers", () => {
  it("truncates text using display-width wrapping", () => {
    expect(truncateToDisplayWidth("abcdef", 3)).toBe("abc");
    expect(truncateToDisplayWidth("한글abc", 4)).toBe("한글");
    expect(truncateToDisplayWidth("abc", 0)).toBe("");
  });

  it("formats token and cache badges", () => {
    expect(formatTokenSavingsBadge({
      originalTokens: 100,
      optimizedTokens: 75,
      savedTokens: 25,
      savedPercent: 24.6,
    })).toBe("tok -25%");

    expect(formatCacheHitBadge({
      kind: "session",
      sourceSessionId: "s1",
      cacheAge: 0,
      tokensSaved: 12,
    })).toBe("cache hit(세션 · 오늘)");

    expect(formatCacheHitBadge({
      kind: "task",
      sourceSessionId: "s1",
      sourceTaskId: "t1",
      cacheAge: 2 * 24 * 60 * 60 * 1000,
      tokensSaved: 12,
    })).toBe("cache hit(task · 2일 전)");
  });

  it("returns undefined outside a git repository", () => {
    const dir = mkdtempSync(join(tmpdir(), "detoks-tui-helper-"));
    try {
      expect(resolveFooterBranchLabel(dir)).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
