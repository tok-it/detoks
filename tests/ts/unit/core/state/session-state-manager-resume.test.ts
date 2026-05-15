import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { SessionStateManager } from "../../../../../src/core/state/SessionStateManager.js";
import { resolveLegacySessionsDir } from "../../../../../src/core/state/storage-paths.js";

function writeSession(dir: string, id: string, content: object) {
  const sessionsDir = resolveLegacySessionsDir(dir);
  mkdirSync(sessionsDir, { recursive: true });
  writeFileSync(join(sessionsDir, `${id}.json`), JSON.stringify(content, null, 2));
}

function makeIncompleteSession(overrides: Record<string, unknown> = {}) {
  return {
    shared_context: {
      session_id: "sess-partial",
      raw_input_hash: "hash-partial-001",
      project_id: "proj-abc",
      failed_task_ids: [],
    },
    task_results: {
      t1: {
        task_id: "t1",
        success: true,
        raw_output: "t1 done",
        summary: "t1 done",
        input_hash: "taskhash0001",
        completed_at: new Date().toISOString(),
      },
    },
    current_task_id: "t2",       // 아직 진행 중
    completed_task_ids: ["t1"],  // t1만 완료
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("SessionStateManager.findIncompleteSessionByInputHash", () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "detoks-ssm-resume-"));
    origCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("미완성 세션(current_task_id 존재, completed_task_ids > 0)을 반환", async () => {
    writeSession(tmpDir, "sess-partial", makeIncompleteSession());

    const result = await SessionStateManager.findIncompleteSessionByInputHash(
      "hash-partial-001",
    );

    expect(result).not.toBeNull();
    expect(result?.shared_context.session_id).toBe("sess-partial");
    expect(result?.current_task_id).toBe("t2");
    expect(result?.completed_task_ids).toEqual(["t1"]);
  });

  it("completed된 세션(current_task_id=null)은 반환하지 않음", async () => {
    writeSession(tmpDir, "sess-done", makeIncompleteSession({
      current_task_id: null,
      completed_task_ids: ["t1", "t2"],
    }));

    const result = await SessionStateManager.findIncompleteSessionByInputHash(
      "hash-partial-001",
    );

    expect(result).toBeNull();
  });

  it("completed_task_ids가 비어있는 세션(아무것도 안 한 세션)은 반환하지 않음", async () => {
    writeSession(tmpDir, "sess-empty", makeIncompleteSession({
      current_task_id: "t1",
      completed_task_ids: [],  // 아무것도 완료 안 됨
    }));

    const result = await SessionStateManager.findIncompleteSessionByInputHash(
      "hash-partial-001",
    );

    expect(result).toBeNull();
  });

  it("hash가 다른 세션은 반환하지 않음", async () => {
    writeSession(tmpDir, "sess-partial", makeIncompleteSession());

    const result = await SessionStateManager.findIncompleteSessionByInputHash(
      "completely-different-hash",
    );

    expect(result).toBeNull();
  });

  it("project_id 필터링: 다른 프로젝트의 미완성 세션은 반환하지 않음", async () => {
    writeSession(tmpDir, "sess-partial", makeIncompleteSession({
      shared_context: {
        session_id: "sess-partial",
        raw_input_hash: "hash-partial-001",
        project_id: "proj-other",
        failed_task_ids: [],
      },
    }));

    const result = await SessionStateManager.findIncompleteSessionByInputHash(
      "hash-partial-001",
      { project_id: "proj-abc" },
    );

    expect(result).toBeNull();
  });

  it("recencyHours 초과 세션은 반환하지 않음", async () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25시간 전
    writeSession(tmpDir, "sess-old", makeIncompleteSession({ updated_at: old }));

    const result = await SessionStateManager.findIncompleteSessionByInputHash(
      "hash-partial-001",
      { recencyHours: 24 },
    );

    expect(result).toBeNull();
  });

  it("세션 디렉터리가 없으면 null 반환", async () => {
    const result = await SessionStateManager.findIncompleteSessionByInputHash(
      "hash-partial-001",
    );

    expect(result).toBeNull();
  });
});
