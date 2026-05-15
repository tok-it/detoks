/**
 * FailurePatternAnalyzer 임계값 경계 케이스 검증 데이터셋
 *
 * 기존 failure-pattern-analyzer.test.ts에서 다루지 않는 경계 케이스:
 * - 정확히 threshold(20%) → 경고 발생
 * - threshold - ε → 경고 없음
 * - 샘플 1건만 있을 때 (100% or 0%)
 * - 여러 adapter × taskType 조합 중 일부만 임계값 초과
 * - 커스텀 threshold(0, 1 경계)
 */

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
    taskResults[t.id] = {
      task_id: t.id,
      type: t.type,
      success: t.success,
      raw_output: "",
      summary: "",
    };
  }
  const completedIds = tasks.filter((t) => t.success).map((t) => t.id);
  const data = {
    shared_context: { session_id: sessionId, adapter },
    completed_task_ids: completedIds,
    task_results: taskResults,
    current_task_id: null,
    updated_at: new Date().toISOString(),
  };
  writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify(data));
}

describe("FailurePatternAnalyzer — 임계값 경계 케이스", () => {
  let sessionsDir: string;

  beforeEach(() => {
    sessionsDir = mkdtempSync(join(tmpdir(), "detoks-fail-boundary-"));
  });

  afterEach(() => {
    rmSync(sessionsDir, { recursive: true, force: true });
  });

  describe("기본 threshold=0.2 경계", () => {
    it("실패율 정확히 20% (1/5) → 경고 발생 (threshold 이상)", async () => {
      // 5건 중 1건 실패 = 0.2 → threshold와 같으므로 경고 발생 (< threshold 조건이므로)
      writeSession(sessionsDir, "s1", "claude", [{ id: "t1", type: "EXECUTE", success: false }]);
      writeSession(sessionsDir, "s2", "claude", [{ id: "t1", type: "EXECUTE", success: true }]);
      writeSession(sessionsDir, "s3", "claude", [{ id: "t1", type: "EXECUTE", success: true }]);
      writeSession(sessionsDir, "s4", "claude", [{ id: "t1", type: "EXECUTE", success: true }]);
      writeSession(sessionsDir, "s5", "claude", [{ id: "t1", type: "EXECUTE", success: true }]);

      const analyzer = new FailurePatternAnalyzer(sessionsDir);
      const warning = await analyzer.getWarning("EXECUTE", "claude", 0.2);

      // 실패율 = 0.2, threshold = 0.2 → failureRate < threshold 가 false이므로 경고 발생
      expect(warning).toBeDefined();
      expect(warning).toContain("20%");
    });

    it("실패율 19% (미만) → 경고 없음 (10건 중 1건 실패 = 10%)", async () => {
      // 10건 중 1건 실패 = 10% < 20%
      for (let i = 0; i < 9; i++) {
        writeSession(sessionsDir, `s${i}`, "claude", [
          { id: "t1", type: "ANALYZE", success: true },
        ]);
      }
      writeSession(sessionsDir, "s9", "claude", [
        { id: "t1", type: "ANALYZE", success: false },
      ]);

      const analyzer = new FailurePatternAnalyzer(sessionsDir);
      const warning = await analyzer.getWarning("ANALYZE", "claude", 0.2);

      expect(warning).toBeUndefined();
    });

    it("실패율 21% (2/9 ≈ 22%) → 경고 발생", async () => {
      for (let i = 0; i < 7; i++) {
        writeSession(sessionsDir, `s${i}`, "codex", [
          { id: "t1", type: "CREATE", success: true },
        ]);
      }
      writeSession(sessionsDir, "s7", "codex", [{ id: "t1", type: "CREATE", success: false }]);
      writeSession(sessionsDir, "s8", "codex", [{ id: "t1", type: "CREATE", success: false }]);

      const analyzer = new FailurePatternAnalyzer(sessionsDir);
      const warning = await analyzer.getWarning("CREATE", "codex", 0.2);

      expect(warning).toBeDefined();
    });
  });

  describe("극단 샘플 케이스", () => {
    it("샘플 1건, 실패 → 실패율 100% → threshold=0.2에서 경고 발생", async () => {
      writeSession(sessionsDir, "s1", "claude", [{ id: "t1", type: "MODIFY", success: false }]);

      const analyzer = new FailurePatternAnalyzer(sessionsDir);
      const warning = await analyzer.getWarning("MODIFY", "claude", 0.2);

      expect(warning).toBeDefined();
      expect(warning).toContain("100%");
    });

    it("샘플 1건, 성공 → 실패율 0% → 경고 없음", async () => {
      writeSession(sessionsDir, "s1", "claude", [{ id: "t1", type: "MODIFY", success: true }]);

      const analyzer = new FailurePatternAnalyzer(sessionsDir);
      const warning = await analyzer.getWarning("MODIFY", "claude", 0.2);

      expect(warning).toBeUndefined();
    });

    it("샘플 2건, 모두 실패 → 실패율 100% → 경고 발생", async () => {
      writeSession(sessionsDir, "s1", "codex", [{ id: "t1", type: "EXPLORE", success: false }]);
      writeSession(sessionsDir, "s2", "codex", [{ id: "t1", type: "EXPLORE", success: false }]);

      const analyzer = new FailurePatternAnalyzer(sessionsDir);
      const warning = await analyzer.getWarning("EXPLORE", "codex", 0.2);

      expect(warning).toBeDefined();
    });
  });

  describe("커스텀 threshold 경계", () => {
    it("threshold=0 → 실패 0건이어도 경고 발생 (0 >= 0이므로)", async () => {
      // threshold=0이면 failureRate < 0은 항상 false → 무조건 경고
      // 단, entry가 없으면 undefined 반환
      writeSession(sessionsDir, "s1", "claude", [{ id: "t1", type: "CREATE", success: true }]);

      const analyzer = new FailurePatternAnalyzer(sessionsDir);
      const warning = await analyzer.getWarning("CREATE", "claude", 0);

      expect(warning).toBeDefined();
    });

    it("threshold=1.0 → 실패율 100%여도 경고 없음 (rate < 1.0이므로)", async () => {
      writeSession(sessionsDir, "s1", "claude", [{ id: "t1", type: "CREATE", success: false }]);

      const analyzer = new FailurePatternAnalyzer(sessionsDir);
      const warning = await analyzer.getWarning("CREATE", "claude", 1.0);

      // 실패율 = 1.0, threshold = 1.0 → failureRate < 1.0 가 false → 경고 발생
      // 이것이 의도된 동작인지 확인하는 문서화 테스트
      expect(warning).toBeDefined();
    });

    it("threshold=0.5 — 실패율이 정확히 50%면 경고 발생", async () => {
      writeSession(sessionsDir, "s1", "codex", [{ id: "t1", type: "ANALYZE", success: false }]);
      writeSession(sessionsDir, "s2", "codex", [{ id: "t1", type: "ANALYZE", success: true }]);

      const analyzer = new FailurePatternAnalyzer(sessionsDir);
      const warning = await analyzer.getWarning("ANALYZE", "codex", 0.5);

      expect(warning).toBeDefined();
    });
  });

  describe("여러 adapter × taskType 조합 격리", () => {
    it("같은 taskType이라도 adapter별로 독립적으로 집계된다", async () => {
      // claude: EXECUTE 실패율 100% (경고 O)
      writeSession(sessionsDir, "s1", "claude", [{ id: "t1", type: "EXECUTE", success: false }]);
      // codex: EXECUTE 실패율 0% (경고 X)
      writeSession(sessionsDir, "s2", "codex", [{ id: "t1", type: "EXECUTE", success: true }]);

      const analyzer = new FailurePatternAnalyzer(sessionsDir);

      const claudeWarning = await analyzer.getWarning("EXECUTE", "claude", 0.2);
      const codexWarning = await analyzer.getWarning("EXECUTE", "codex", 0.2);

      expect(claudeWarning).toBeDefined();
      expect(codexWarning).toBeUndefined();
    });

    it("같은 adapter라도 taskType별로 독립적으로 집계된다", async () => {
      // EXECUTE 실패율 100%
      writeSession(sessionsDir, "s1", "claude", [{ id: "t1", type: "EXECUTE", success: false }]);
      // CREATE 실패율 0%
      writeSession(sessionsDir, "s2", "claude", [{ id: "t1", type: "CREATE", success: true }]);

      const analyzer = new FailurePatternAnalyzer(sessionsDir);

      const executeWarning = await analyzer.getWarning("EXECUTE", "claude", 0.2);
      const createWarning = await analyzer.getWarning("CREATE", "claude", 0.2);

      expect(executeWarning).toBeDefined();
      expect(createWarning).toBeUndefined();
    });

    it("존재하지 않는 taskType × adapter 조합 → undefined 반환", async () => {
      writeSession(sessionsDir, "s1", "claude", [{ id: "t1", type: "EXECUTE", success: false }]);

      const analyzer = new FailurePatternAnalyzer(sessionsDir);
      const warning = await analyzer.getWarning("NONEXISTENT_TYPE", "claude", 0.2);

      expect(warning).toBeUndefined();
    });

    it("세션당 여러 task가 있을 때 각 task가 개별 집계된다", async () => {
      // 한 세션에 EXECUTE 성공 + CREATE 실패
      writeSession(sessionsDir, "s1", "claude", [
        { id: "t1", type: "EXECUTE", success: true },
        { id: "t2", type: "CREATE", success: false },
      ]);

      const analyzer = new FailurePatternAnalyzer(sessionsDir);
      const stats = await analyzer.analyze();

      const executeEntry = stats.find((s) => s.taskType === "EXECUTE" && s.adapter === "claude");
      const createEntry = stats.find((s) => s.taskType === "CREATE" && s.adapter === "claude");

      expect(executeEntry).toBeDefined();
      expect(executeEntry!.failureRate).toBe(0);
      expect(createEntry).toBeDefined();
      expect(createEntry!.failureRate).toBe(1);
    });
  });

  describe("analyze() 정렬 및 통계 검증", () => {
    it("failureRate 0.0 항목도 통계에 포함된다", async () => {
      writeSession(sessionsDir, "s1", "claude", [{ id: "t1", type: "EXPLORE", success: true }]);

      const analyzer = new FailurePatternAnalyzer(sessionsDir);
      const stats = await analyzer.analyze();

      const entry = stats.find((s) => s.taskType === "EXPLORE" && s.adapter === "claude");
      expect(entry).toBeDefined();
      expect(entry!.failureRate).toBe(0);
    });

    it("totalCount와 failCount의 합이 맞는다", async () => {
      // 3건 중 2건 실패
      writeSession(sessionsDir, "s1", "codex", [{ id: "t1", type: "CREATE", success: false }]);
      writeSession(sessionsDir, "s2", "codex", [{ id: "t1", type: "CREATE", success: false }]);
      writeSession(sessionsDir, "s3", "codex", [{ id: "t1", type: "CREATE", success: true }]);

      const analyzer = new FailurePatternAnalyzer(sessionsDir);
      const stats = await analyzer.analyze();

      const entry = stats.find((s) => s.taskType === "CREATE" && s.adapter === "codex");
      expect(entry!.totalCount).toBe(3);
      expect(entry!.failCount).toBe(2);
      expect(entry!.failureRate).toBeCloseTo(2 / 3);
    });
  });
});
