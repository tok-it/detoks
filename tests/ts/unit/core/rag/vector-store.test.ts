import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { VectorStore } from "../../../../../src/core/rag/vector-store.js";

const DIMS = 4;

function makeVec(values: number[]): Float32Array {
  return new Float32Array(values);
}

describe("VectorStore", () => {
  let tmpDir: string;
  let store: VectorStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "detoks-vs-test-"));
    store = new VectorStore(join(tmpDir, "test.db"), DIMS);
    store.open();
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("upsert 후 같은 id로 다시 upsert하면 덮어쓴다", () => {
    store.upsert("id-1", makeVec([1, 0, 0, 0]), { kind: "task", session_id: "s1" });
    store.upsert("id-1", makeVec([0, 1, 0, 0]), { kind: "task", session_id: "s1" });

    const results = store.search(makeVec([0, 1, 0, 0]), 1);
    expect(results).toHaveLength(1);
    const first = results[0];
    expect(first).toBeDefined();
    expect(first?.id).toBe("id-1");
    expect(first?.distance).toBeCloseTo(0, 4);
  });

  it("search — 쿼리와 가장 가까운 벡터를 반환한다", () => {
    store.upsert("id-close", makeVec([1, 0, 0, 0]), { kind: "task", session_id: "s1" });
    store.upsert("id-far",   makeVec([0, 0, 0, 1]), { kind: "task", session_id: "s2" });

    const results = store.search(makeVec([0.9, 0.1, 0, 0]), 1);
    const first = results[0];
    expect(first).toBeDefined();
    expect(first?.id).toBe("id-close");
  });

  it("search — k개 이하로 결과를 제한한다", () => {
    store.upsert("a", makeVec([1, 0, 0, 0]), { kind: "task", session_id: "s1" });
    store.upsert("b", makeVec([0, 1, 0, 0]), { kind: "task", session_id: "s1" });
    store.upsert("c", makeVec([0, 0, 1, 0]), { kind: "task", session_id: "s1" });

    const results = store.search(makeVec([1, 0, 0, 0]), 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("search — kind 필터링이 동작한다", () => {
    store.upsert("task-1",   makeVec([1, 0, 0, 0]), { kind: "task",   session_id: "s1" });
    store.upsert("prompt-1", makeVec([1, 0, 0, 0]), { kind: "prompt", session_id: "s1" });

    const results = store.search(makeVec([1, 0, 0, 0]), 5, { kind: "task" });
    expect(results.every(r => r.meta.kind === "task")).toBe(true);
    expect(results.some(r => r.id === "task-1")).toBe(true);
    expect(results.some(r => r.id === "prompt-1")).toBe(false);
  });

  it("delete — 삭제된 항목은 검색 결과에서 제거된다", () => {
    store.upsert("del-me", makeVec([1, 0, 0, 0]), { kind: "task", session_id: "s1" });
    store.delete("del-me");

    const results = store.search(makeVec([1, 0, 0, 0]), 5);
    expect(results.some(r => r.id === "del-me")).toBe(false);
  });

  it("항목이 없으면 search가 빈 배열을 반환한다", () => {
    const results = store.search(makeVec([1, 0, 0, 0]), 5);
    expect(results).toHaveLength(0);
  });

  it("결과에 meta(kind, session_id) 정보가 포함된다", () => {
    store.upsert("id-1", makeVec([1, 0, 0, 0]), { kind: "output", session_id: "sess-xyz", task_id: "t1" });
    const results = store.search(makeVec([1, 0, 0, 0]), 1);
    const first = results[0];
    expect(first).toBeDefined();
    expect(first?.meta.kind).toBe("output");
    expect(first?.meta.session_id).toBe("sess-xyz");
    expect(first?.meta.task_id).toBe("t1");
  });
});
