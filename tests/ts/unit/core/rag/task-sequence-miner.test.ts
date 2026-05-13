import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskSequenceMiner } from "../../../../../src/core/rag/task-sequence-miner.js";

function writeSession(dir: string, sessionId: string, taskSequence: Array<{ id: string; type: string; success?: boolean }>) {
  const taskResults: Record<string, object> = {};
  for (const t of taskSequence) {
    taskResults[t.id] = { task_id: t.id, type: t.type, success: t.success ?? true, raw_output: "", summary: "" };
  }
  const data = {
    shared_context: { session_id: sessionId },
    completed_task_ids: taskSequence.filter((t) => t.success !== false).map((t) => t.id),
    task_results: taskResults,
    current_task_id: null,
    updated_at: new Date().toISOString(),
  };
  writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify(data));
}

describe("TaskSequenceMiner", () => {
  let sessionsDir: string;

  beforeEach(() => {
    sessionsDir = mkdtempSync(join(tmpdir(), "detoks-seq-miner-"));
  });

  afterEach(() => {
    rmSync(sessionsDir, { recursive: true, force: true });
  });

  it("세션이 없으면 빈 패턴 목록을 반환한다", async () => {
    const miner = new TaskSequenceMiner(sessionsDir);
    const patterns = await miner.mine();
    expect(patterns).toHaveLength(0);
  });

  it("단일 세션의 bigram 패턴을 추출한다", async () => {
    writeSession(sessionsDir, "s1", [
      { id: "t1", type: "CREATE" },
      { id: "t2", type: "EXECUTE" },
    ]);
    const miner = new TaskSequenceMiner(sessionsDir);
    const patterns = await miner.mine();

    const bigram = patterns.find((p) => p.sequence.join("→") === "CREATE→EXECUTE");
    expect(bigram).toBeDefined();
    expect(bigram!.count).toBe(1);
  });

  it("여러 세션에서 동일 패턴이 반복되면 count가 누적된다", async () => {
    writeSession(sessionsDir, "s1", [{ id: "t1", type: "CREATE" }, { id: "t2", type: "EXECUTE" }]);
    writeSession(sessionsDir, "s2", [{ id: "t1", type: "CREATE" }, { id: "t2", type: "EXECUTE" }]);
    writeSession(sessionsDir, "s3", [{ id: "t1", type: "EXPLORE" }, { id: "t2", type: "VALIDATE" }]);

    const miner = new TaskSequenceMiner(sessionsDir);
    const patterns = await miner.mine();

    const bigram = patterns.find((p) => p.sequence.join("→") === "CREATE→EXECUTE");
    expect(bigram!.count).toBe(2);
    expect(bigram!.sessions).toHaveLength(2);
  });

  it("trigram 패턴도 추출한다", async () => {
    writeSession(sessionsDir, "s1", [
      { id: "t1", type: "EXPLORE" },
      { id: "t2", type: "CREATE" },
      { id: "t3", type: "VALIDATE" },
    ]);
    const miner = new TaskSequenceMiner(sessionsDir);
    const patterns = await miner.mine();

    const trigram = patterns.find((p) => p.sequence.join("→") === "EXPLORE→CREATE→VALIDATE");
    expect(trigram).toBeDefined();
    expect(trigram!.count).toBe(1);
  });

  it("minCount 미만인 패턴은 결과에서 제외된다", async () => {
    writeSession(sessionsDir, "s1", [{ id: "t1", type: "CREATE" }, { id: "t2", type: "EXECUTE" }]);
    writeSession(sessionsDir, "s2", [{ id: "t1", type: "EXPLORE" }, { id: "t2", type: "VALIDATE" }]);

    const miner = new TaskSequenceMiner(sessionsDir);
    const patterns = await miner.mine({ minCount: 2 });

    // 둘 다 count=1이므로 모두 제외
    expect(patterns).toHaveLength(0);
  });

  it("패턴 결과는 count 내림차순으로 정렬된다", async () => {
    writeSession(sessionsDir, "s1", [{ id: "t1", type: "CREATE" }, { id: "t2", type: "EXECUTE" }]);
    writeSession(sessionsDir, "s2", [{ id: "t1", type: "CREATE" }, { id: "t2", type: "EXECUTE" }]);
    writeSession(sessionsDir, "s3", [{ id: "t1", type: "EXPLORE" }, { id: "t2", type: "VALIDATE" }]);

    const miner = new TaskSequenceMiner(sessionsDir);
    const patterns = await miner.mine();

    for (let i = 1; i < patterns.length; i++) {
      expect(patterns[i - 1]!.count).toBeGreaterThanOrEqual(patterns[i]!.count);
    }
  });

  it("predictNext — 현재 시퀀스 마지막 타입 기준으로 다음 타입을 예측한다", async () => {
    writeSession(sessionsDir, "s1", [{ id: "t1", type: "CREATE" }, { id: "t2", type: "EXECUTE" }]);
    writeSession(sessionsDir, "s2", [{ id: "t1", type: "CREATE" }, { id: "t2", type: "EXECUTE" }]);
    writeSession(sessionsDir, "s3", [{ id: "t1", type: "CREATE" }, { id: "t2", type: "VALIDATE" }]);

    const miner = new TaskSequenceMiner(sessionsDir);
    const next = await miner.predictNext(["CREATE"]);

    // CREATE 다음으로 EXECUTE가 2회, VALIDATE가 1회 → EXECUTE 예측
    expect(next).toBe("EXECUTE");
  });

  it("predictNext — 매칭 패턴이 없으면 undefined를 반환한다", async () => {
    writeSession(sessionsDir, "s1", [{ id: "t1", type: "CREATE" }, { id: "t2", type: "EXECUTE" }]);

    const miner = new TaskSequenceMiner(sessionsDir);
    const next = await miner.predictNext(["UNKNOWN_TYPE"]);

    expect(next).toBeUndefined();
  });

  it("task_results에 type이 없는 task는 'UNKNOWN'으로 처리한다", async () => {
    const data = {
      shared_context: { session_id: "s-notype" },
      completed_task_ids: ["t1", "t2"],
      task_results: {
        t1: { task_id: "t1", success: true, raw_output: "" },
        t2: { task_id: "t2", type: "EXECUTE", success: true, raw_output: "" },
      },
      current_task_id: null,
      updated_at: new Date().toISOString(),
    };
    writeFileSync(join(sessionsDir, "s-notype.json"), JSON.stringify(data));

    const miner = new TaskSequenceMiner(sessionsDir);
    const patterns = await miner.mine();

    const bigram = patterns.find((p) => p.sequence[0] === "UNKNOWN");
    expect(bigram).toBeDefined();
  });
});
