import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { SessionStateManager } from "../../../../../src/core/state/SessionStateManager.js";

const SESSIONS_SUBDIR = ".state/sessions";

function writeSession(dir: string, id: string, content: object) {
  const sessionsDir = join(dir, SESSIONS_SUBDIR);
  mkdirSync(sessionsDir, { recursive: true });
  writeFileSync(join(sessionsDir, `${id}.json`), JSON.stringify(content, null, 2));
}

function makeValidSession(overrides: Record<string, unknown> = {}) {
  return {
    shared_context: {
      session_id: "sess-abc",
      raw_input_hash: "abcdef1234567890",
      project_id: "git-proj123",
      failed_task_ids: [],
    },
    task_results: {
      t1: {
        task_id: "t1",
        success: true,
        raw_output: "output of t1",
        summary: "output of t1",
        input_hash: "taskhash0001",
        completed_at: new Date().toISOString(),
      },
    },
    current_task_id: null,
    completed_task_ids: ["t1"],
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("SessionStateManager.findSuccessfulSessionByInputHash", () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "detoks-ssm-test-"));
    origCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("매칭 hash를 가진 세션을 반환", async () => {
    writeSession(tmpDir, "sess-abc", makeValidSession());
    const result = await SessionStateManager.findSuccessfulSessionByInputHash(
      "abcdef1234567890",
    );
    expect(result).not.toBeNull();
    expect(result?.shared_context.session_id).toBe("sess-abc");
  });

  it("다른 hash는 null 반환", async () => {
    writeSession(tmpDir, "sess-abc", makeValidSession());
    const result = await SessionStateManager.findSuccessfulSessionByInputHash("000000000000");
    expect(result).toBeNull();
  });

  it("project_id 불일치 시 null", async () => {
    writeSession(tmpDir, "sess-abc", makeValidSession());
    const result = await SessionStateManager.findSuccessfulSessionByInputHash(
      "abcdef1234567890",
      { project_id: "git-other" },
    );
    expect(result).toBeNull();
  });

  it("failed_task_ids가 있는 세션은 무시", async () => {
    const session = makeValidSession({
      shared_context: {
        session_id: "sess-abc",
        raw_input_hash: "abcdef1234567890",
        project_id: "git-proj123",
        failed_task_ids: ["t1"],
      },
    });
    writeSession(tmpDir, "sess-abc", session);
    const result = await SessionStateManager.findSuccessfulSessionByInputHash(
      "abcdef1234567890",
    );
    expect(result).toBeNull();
  });

  it("TTL 초과 세션은 null 반환", async () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    writeSession(tmpDir, "sess-abc", makeValidSession({ updated_at: old }));
    const result = await SessionStateManager.findSuccessfulSessionByInputHash(
      "abcdef1234567890",
      { recencyDays: 7 },
    );
    expect(result).toBeNull();
  });

  it("세션 디렉토리 없으면 null 반환", async () => {
    const result = await SessionStateManager.findSuccessfulSessionByInputHash("any");
    expect(result).toBeNull();
  });
});

describe("SessionStateManager.findSuccessfulTaskByHash", () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "detoks-ssm-task-test-"));
    origCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("task hash 매칭 시 결과 반환", async () => {
    writeSession(tmpDir, "sess-abc", makeValidSession());
    const result = await SessionStateManager.findSuccessfulTaskByHash("taskhash0001");
    expect(result).not.toBeNull();
    expect(result?.taskResult.raw_output).toBe("output of t1");
    expect(result?.sessionId).toBe("sess-abc");
  });

  it("다른 hash는 null 반환", async () => {
    writeSession(tmpDir, "sess-abc", makeValidSession());
    const result = await SessionStateManager.findSuccessfulTaskByHash("notexist");
    expect(result).toBeNull();
  });

  it("success=false인 task는 무시", async () => {
    const session = makeValidSession({
      task_results: {
        t1: {
          task_id: "t1",
          success: false,
          raw_output: "failed",
          summary: "failed",
          input_hash: "taskhash0001",
          completed_at: new Date().toISOString(),
        },
      },
    });
    writeSession(tmpDir, "sess-abc", session);
    const result = await SessionStateManager.findSuccessfulTaskByHash("taskhash0001");
    expect(result).toBeNull();
  });

  it("completed_at TTL 초과 task는 null", async () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const session = makeValidSession({
      task_results: {
        t1: {
          task_id: "t1",
          success: true,
          raw_output: "output",
          summary: "output",
          input_hash: "taskhash0001",
          completed_at: old,
        },
      },
      updated_at: new Date().toISOString(),
    });
    writeSession(tmpDir, "sess-abc", session);
    const result = await SessionStateManager.findSuccessfulTaskByHash("taskhash0001", {
      recencyDays: 7,
    });
    expect(result).toBeNull();
  });

  it("세션 디렉토리 없으면 null", async () => {
    const result = await SessionStateManager.findSuccessfulTaskByHash("any");
    expect(result).toBeNull();
  });
});
