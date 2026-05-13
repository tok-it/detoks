import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WorkflowTemplateBuilder } from "../../../../../src/core/rag/workflow-template-builder.js";

function writeSession(
  dir: string,
  sessionId: string,
  rawInput: string,
  tasks: Array<{ id: string; type: string; success?: boolean }>,
) {
  const taskResults: Record<string, object> = {};
  for (const t of tasks) {
    taskResults[t.id] = { task_id: t.id, type: t.type, success: t.success ?? true, raw_output: "" };
  }
  writeFileSync(
    join(dir, `${sessionId}.json`),
    JSON.stringify({
      shared_context: { session_id: sessionId, raw_input: rawInput },
      completed_task_ids: tasks.filter((t) => t.success !== false).map((t) => t.id),
      task_results: taskResults,
      current_task_id: null,
      updated_at: new Date().toISOString(),
    }),
  );
}

describe("WorkflowTemplateBuilder", () => {
  let sessionsDir: string;

  beforeEach(() => {
    sessionsDir = mkdtempSync(join(tmpdir(), "detoks-wf-tmpl-"));
  });

  afterEach(() => {
    rmSync(sessionsDir, { recursive: true, force: true });
  });

  it("세션이 없으면 빈 템플릿 목록을 반환한다", async () => {
    const builder = new WorkflowTemplateBuilder(sessionsDir);
    const templates = await builder.build();
    expect(templates).toHaveLength(0);
  });

  it("고빈도 시퀀스 패턴을 템플릿으로 추출한다", async () => {
    const seq = [{ id: "t1", type: "CREATE" }, { id: "t2", type: "EXECUTE" }];
    writeSession(sessionsDir, "s1", "deploy the service", seq);
    writeSession(sessionsDir, "s2", "deploy to production", seq);

    const builder = new WorkflowTemplateBuilder(sessionsDir);
    const templates = await builder.build({ minCount: 2 });

    expect(templates.length).toBeGreaterThanOrEqual(1);
    const tmpl = templates.find((t) => t.typeSequence.join("→") === "CREATE→EXECUTE");
    expect(tmpl).toBeDefined();
    expect(tmpl!.count).toBe(2);
  });

  it("템플릿에 samplePrompts가 포함된다 (최대 3개)", async () => {
    const seq = [{ id: "t1", type: "CREATE" }, { id: "t2", type: "EXECUTE" }];
    writeSession(sessionsDir, "s1", "first deploy", seq);
    writeSession(sessionsDir, "s2", "second deploy", seq);
    writeSession(sessionsDir, "s3", "third deploy", seq);
    writeSession(sessionsDir, "s4", "fourth deploy", seq);

    const builder = new WorkflowTemplateBuilder(sessionsDir);
    const templates = await builder.build({ minCount: 2 });

    const tmpl = templates.find((t) => t.typeSequence.join("→") === "CREATE→EXECUTE");
    expect(tmpl!.samplePrompts.length).toBeLessThanOrEqual(3);
    expect(tmpl!.samplePrompts.length).toBeGreaterThanOrEqual(1);
  });

  it("minCount 미만 패턴은 템플릿에서 제외된다", async () => {
    const seq = [{ id: "t1", type: "EXPLORE" }, { id: "t2", type: "VALIDATE" }];
    writeSession(sessionsDir, "s1", "explore codebase", seq);

    const builder = new WorkflowTemplateBuilder(sessionsDir);
    const templates = await builder.build({ minCount: 2 });

    expect(templates).toHaveLength(0);
  });

  it("count 내림차순으로 정렬된다", async () => {
    const seqA = [{ id: "t1", type: "CREATE" }, { id: "t2", type: "EXECUTE" }];
    const seqB = [{ id: "t1", type: "EXPLORE" }, { id: "t2", type: "VALIDATE" }];
    writeSession(sessionsDir, "s1", "deploy 1", seqA);
    writeSession(sessionsDir, "s2", "deploy 2", seqA);
    writeSession(sessionsDir, "s3", "deploy 3", seqA);
    writeSession(sessionsDir, "s4", "explore 1", seqB);
    writeSession(sessionsDir, "s5", "explore 2", seqB);

    const builder = new WorkflowTemplateBuilder(sessionsDir);
    const templates = await builder.build({ minCount: 1 });

    for (let i = 1; i < templates.length; i++) {
      expect(templates[i - 1]!.count).toBeGreaterThanOrEqual(templates[i]!.count);
    }
  });

  it("suggest — 현재 타입 시퀀스 접두사와 매칭되는 템플릿을 반환한다", async () => {
    const seq = [{ id: "t1", type: "CREATE" }, { id: "t2", type: "EXECUTE" }, { id: "t3", type: "VALIDATE" }];
    writeSession(sessionsDir, "s1", "build and validate", seq);
    writeSession(sessionsDir, "s2", "create and run tests", seq);

    const builder = new WorkflowTemplateBuilder(sessionsDir);
    const suggestion = await builder.suggest(["CREATE"]);

    expect(suggestion).toBeDefined();
    expect(suggestion!.typeSequence[0]).toBe("CREATE");
  });

  it("suggest — 매칭 없으면 undefined 반환", async () => {
    const seq = [{ id: "t1", type: "CREATE" }, { id: "t2", type: "EXECUTE" }];
    writeSession(sessionsDir, "s1", "deploy", seq);

    const builder = new WorkflowTemplateBuilder(sessionsDir);
    const suggestion = await builder.suggest(["UNKNOWN_TYPE"]);

    expect(suggestion).toBeUndefined();
  });

  it("템플릿 id는 typeSequence 기반의 고유 식별자다", async () => {
    const seq = [{ id: "t1", type: "CREATE" }, { id: "t2", type: "EXECUTE" }];
    writeSession(sessionsDir, "s1", "deploy", seq);
    writeSession(sessionsDir, "s2", "deploy again", seq);

    const builder = new WorkflowTemplateBuilder(sessionsDir);
    const templates = await builder.build({ minCount: 1 });

    const ids = templates.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
