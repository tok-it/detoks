import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ProjectMemory } from "../../../../../src/core/rag/project-memory.js";

function writeSession(
  dir: string,
  sessionId: string,
  projectId: string | undefined,
  tasks: Array<{ id: string; type: string; success: boolean }>,
  rawInput = "some prompt",
  adapter = "claude",
) {
  const taskResults: Record<string, object> = {};
  for (const t of tasks) {
    taskResults[t.id] = { task_id: t.id, type: t.type, success: t.success, raw_output: "" };
  }
  writeFileSync(
    join(dir, `${sessionId}.json`),
    JSON.stringify({
      shared_context: {
        session_id: sessionId,
        project_id: projectId,
        raw_input: rawInput,
        adapter,
        token_metrics: {
          input_original_tokens: 1000,
          output_original_tokens: 400,
          reduction_ratio: 0.2,
        },
      },
      completed_task_ids: tasks.filter((t) => t.success).map((t) => t.id),
      task_results: taskResults,
      current_task_id: null,
      updated_at: new Date().toISOString(),
    }),
  );
}

describe("ProjectMemory (F12)", () => {
  let sessionsDir: string;

  beforeEach(() => {
    sessionsDir = mkdtempSync(join(tmpdir(), "detoks-project-mem-"));
  });

  afterEach(() => {
    rmSync(sessionsDir, { recursive: true, force: true });
  });

  it("project_id 필터링 — 동일 project_id 세션만 시퀀스 패턴 분석", async () => {
    writeSession(sessionsDir, "s1", "proj-A", [{ id: "t1", type: "CREATE", success: true }, { id: "t2", type: "EXECUTE", success: true }]);
    writeSession(sessionsDir, "s2", "proj-A", [{ id: "t1", type: "CREATE", success: true }, { id: "t2", type: "EXECUTE", success: true }]);
    writeSession(sessionsDir, "s3", "proj-B", [{ id: "t1", type: "EXPLORE", success: true }, { id: "t2", type: "VALIDATE", success: true }]);

    const memory = new ProjectMemory(sessionsDir, "proj-A");
    const patterns = await memory.getSequencePatterns();

    const hasCreateExecute = patterns.some((p) => p.sequence.join("→") === "CREATE→EXECUTE");
    const hasExploreValidate = patterns.some((p) => p.sequence.join("→") === "EXPLORE→VALIDATE");
    expect(hasCreateExecute).toBe(true);
    expect(hasExploreValidate).toBe(false);
  });

  it("project_id 필터링 — 실패 패턴 분석도 project_id 격리", async () => {
    writeSession(sessionsDir, "s1", "proj-A", [{ id: "t1", type: "EXECUTE", success: false }], "run test", "claude");
    writeSession(sessionsDir, "s2", "proj-B", [{ id: "t1", type: "EXECUTE", success: false }], "run test", "gemini");

    const memoryA = new ProjectMemory(sessionsDir, "proj-A");
    const failStats = await memoryA.getFailureStats();

    const claudeFail = failStats.find((s) => s.adapter === "claude");
    const geminiFail = failStats.find((s) => s.adapter === "gemini");
    expect(claudeFail).toBeDefined();
    expect(geminiFail).toBeUndefined();
  });

  it("project_id 필터링 — adapter 통계도 project_id 격리", async () => {
    writeSession(sessionsDir, "s1", "proj-A", [], "prompt", "claude");
    writeSession(sessionsDir, "s2", "proj-B", [], "prompt", "gemini");

    const memoryA = new ProjectMemory(sessionsDir, "proj-A");
    const stats = await memoryA.getAdapterStats();

    expect(stats.find((s) => s.adapter === "claude")).toBeDefined();
    expect(stats.find((s) => s.adapter === "gemini")).toBeUndefined();
  });

  it("project_id 없는 세션은 undefined projectId로 조회할 때 포함된다", async () => {
    writeSession(sessionsDir, "s1", undefined, [{ id: "t1", type: "CREATE", success: true }, { id: "t2", type: "EXECUTE", success: true }]);
    writeSession(sessionsDir, "s2", undefined, [{ id: "t1", type: "CREATE", success: true }, { id: "t2", type: "EXECUTE", success: true }]);

    const memory = new ProjectMemory(sessionsDir, undefined);
    const patterns = await memory.getSequencePatterns({ minCount: 2 });

    const hasPattern = patterns.some((p) => p.sequence.join("→") === "CREATE→EXECUTE");
    expect(hasPattern).toBe(true);
  });

  it("getWorkflowSuggestion — project_id 격리된 템플릿에서 제안한다", async () => {
    const seq = [{ id: "t1", type: "CREATE", success: true }, { id: "t2", type: "EXECUTE", success: true }];
    writeSession(sessionsDir, "s1", "proj-A", seq, "deploy A");
    writeSession(sessionsDir, "s2", "proj-A", seq, "deploy A again");

    const memory = new ProjectMemory(sessionsDir, "proj-A");
    const suggestion = await memory.getWorkflowSuggestion(["CREATE"]);

    expect(suggestion).toBeDefined();
    expect(suggestion!.typeSequence[0]).toBe("CREATE");
  });
});
