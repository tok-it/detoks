import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FailurePatternAnalyzer } from "../../../../../src/core/rag/failure-pattern-analyzer.js";

function writeSession(
  dir: string,
  sessionId: string,
  adapter: string,
  tasks: Array<{ id: string; type: string; success: boolean }>,
) {
  const taskResults: Record<string, object> = {};
  for (const t of tasks) {
    taskResults[t.id] = { task_id: t.id, type: t.type, success: t.success, raw_output: "", summary: "" };
  }
  const completedIds = tasks.filter((t) => t.success).map((t) => t.id);
  const failedIds = tasks.filter((t) => !t.success).map((t) => t.id);
  const data = {
    shared_context: { session_id: sessionId, adapter },
    completed_task_ids: completedIds,
    task_results: taskResults,
    current_task_id: failedIds[0] ?? null,
    updated_at: new Date().toISOString(),
  };
  writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify(data));
}

describe("FailurePatternAnalyzer", () => {
  let sessionsDir: string;

  beforeEach(() => {
    sessionsDir = mkdtempSync(join(tmpdir(), "detoks-fail-analyzer-"));
  });

  afterEach(() => {
    rmSync(sessionsDir, { recursive: true, force: true });
  });

  it("세션이 없으면 빈 통계를 반환한다", async () => {
    const analyzer = new FailurePatternAnalyzer(sessionsDir);
    const stats = await analyzer.analyze();
    expect(stats).toHaveLength(0);
  });

  it("실패한 task의 type × adapter 조합을 집계한다", async () => {
    writeSession(sessionsDir, "s1", "gemini", [
      { id: "t1", type: "CREATE", success: true },
      { id: "t2", type: "EXECUTE", success: false },
    ]);
    const analyzer = new FailurePatternAnalyzer(sessionsDir);
    const stats = await analyzer.analyze();

    const entry = stats.find((s) => s.taskType === "EXECUTE" && s.adapter === "gemini");
    expect(entry).toBeDefined();
    expect(entry!.failCount).toBe(1);
    expect(entry!.totalCount).toBe(1);
  });

  it("실패율을 [0, 1] 범위로 계산한다", async () => {
    // EXECUTE × codex: 1 success, 1 fail → 50%
    writeSession(sessionsDir, "s1", "codex", [{ id: "t1", type: "EXECUTE", success: true }]);
    writeSession(sessionsDir, "s2", "codex", [{ id: "t1", type: "EXECUTE", success: false }]);

    const analyzer = new FailurePatternAnalyzer(sessionsDir);
    const stats = await analyzer.analyze();

    const entry = stats.find((s) => s.taskType === "EXECUTE" && s.adapter === "codex");
    expect(entry!.failureRate).toBeCloseTo(0.5);
  });

  it("failureRate 내림차순으로 정렬된다", async () => {
    writeSession(sessionsDir, "s1", "claude", [{ id: "t1", type: "EXECUTE", success: false }]);
    writeSession(sessionsDir, "s2", "codex", [{ id: "t1", type: "CREATE", success: false }]);
    writeSession(sessionsDir, "s3", "codex", [{ id: "t1", type: "CREATE", success: true }]);

    const analyzer = new FailurePatternAnalyzer(sessionsDir);
    const stats = await analyzer.analyze();

    for (let i = 1; i < stats.length; i++) {
      expect(stats[i - 1]!.failureRate).toBeGreaterThanOrEqual(stats[i]!.failureRate);
    }
  });

  it("getWarning — 실패율이 threshold 이상인 조합에 경고 메시지를 반환한다", async () => {
    writeSession(sessionsDir, "s1", "claude", [{ id: "t1", type: "EXECUTE", success: false }]);
    writeSession(sessionsDir, "s2", "claude", [{ id: "t1", type: "EXECUTE", success: false }]);
    writeSession(sessionsDir, "s3", "claude", [{ id: "t1", type: "EXECUTE", success: true }]);

    const analyzer = new FailurePatternAnalyzer(sessionsDir);
    const warning = await analyzer.getWarning("EXECUTE", "claude", 0.5);

    expect(warning).toBeDefined();
    expect(warning).toContain("EXECUTE");
    expect(warning).toContain("claude");
  });

  it("getWarning — 실패율이 threshold 미만이면 undefined를 반환한다", async () => {
    writeSession(sessionsDir, "s1", "claude", [{ id: "t1", type: "EXECUTE", success: true }]);
    writeSession(sessionsDir, "s2", "claude", [{ id: "t1", type: "EXECUTE", success: true }]);

    const analyzer = new FailurePatternAnalyzer(sessionsDir);
    const warning = await analyzer.getWarning("EXECUTE", "claude", 0.5);

    expect(warning).toBeUndefined();
  });

  it("adapter 정보가 없는 세션은 'unknown'으로 집계한다", async () => {
    const data = {
      shared_context: { session_id: "s-noadapter" },
      completed_task_ids: [],
      task_results: { t1: { task_id: "t1", type: "CREATE", success: false, raw_output: "" } },
      current_task_id: "t1",
      updated_at: new Date().toISOString(),
    };
    writeFileSync(join(sessionsDir, "s-noadapter.json"), JSON.stringify(data));

    const analyzer = new FailurePatternAnalyzer(sessionsDir);
    const stats = await analyzer.analyze();

    const entry = stats.find((s) => s.adapter === "unknown");
    expect(entry).toBeDefined();
  });
});
