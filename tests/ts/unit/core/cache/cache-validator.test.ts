import { describe, expect, it } from "vitest";
import { isSessionCacheValid, isTaskCacheValid } from "../../../../../src/core/cache/cache-validator.js";
import type { SessionState } from "../../../../../src/schemas/pipeline.js";

const makeSession = (overrides: Partial<SessionState> & { shared_context?: Record<string, unknown> } = {}): SessionState => ({
  shared_context: {
    session_id: "test-session",
    project_id: "git-abc123",
    failed_task_ids: [],
    ...overrides.shared_context,
  },
  task_results: {},
  current_task_id: null,
  completed_task_ids: ["t1"],
  updated_at: new Date().toISOString(),
  ...overrides,
});

describe("isSessionCacheValid", () => {
  it("유효한 세션은 auto 반환", () => {
    expect(isSessionCacheValid(makeSession())).toBe("auto");
  });

  it("project_id 불일치 시 skip", () => {
    const session = makeSession({ shared_context: { session_id: "s1", project_id: "git-xyz" } });
    expect(isSessionCacheValid(session, { project_id: "git-abc123" })).toBe("skip");
  });

  it("project_id 일치 시 auto", () => {
    const session = makeSession({ shared_context: { session_id: "s1", project_id: "git-abc123" } });
    expect(isSessionCacheValid(session, { project_id: "git-abc123" })).toBe("auto");
  });

  it("failed_task_ids가 있으면 skip", () => {
    const session = makeSession({ shared_context: { session_id: "s1", failed_task_ids: ["t1"] } });
    expect(isSessionCacheValid(session)).toBe("skip");
  });

  it("completed_task_ids가 비어있으면 skip", () => {
    const session = makeSession({ completed_task_ids: [] });
    expect(isSessionCacheValid(session)).toBe("skip");
  });

  it("TTL 초과 시 skip", () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const session = makeSession({ updated_at: old });
    expect(isSessionCacheValid(session, { recencyDays: 7 })).toBe("skip");
  });

  it("TTL 이내이면 auto", () => {
    const recent = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const session = makeSession({ updated_at: recent });
    expect(isSessionCacheValid(session, { recencyDays: 7 })).toBe("auto");
  });

  it("adapter 불일치 시 advise (stamp 있는 세션)", () => {
    const session = makeSession({ shared_context: { session_id: "s1", project_id: "git-abc123", adapter: "codex" } });
    expect(isSessionCacheValid(session, { expected_adapter: "claude" })).toBe("advise");
  });

  it("adapter 일치 시 auto", () => {
    const session = makeSession({ shared_context: { session_id: "s1", project_id: "git-abc123", adapter: "claude" } });
    expect(isSessionCacheValid(session, { expected_adapter: "claude" })).toBe("auto");
  });

  it("stamp 없는 구 세션은 adapter 불일치여도 auto (후방 호환)", () => {
    const session = makeSession(); // adapter stamp 없음
    expect(isSessionCacheValid(session, { expected_adapter: "claude" })).toBe("auto");
  });

  it("git_head 불일치 시 advise (stamp 있는 세션)", () => {
    const session = makeSession({ shared_context: { session_id: "s1", project_id: "git-abc123", git_head: "aabbccdd" } });
    expect(isSessionCacheValid(session, { expected_git_head: "11223344" })).toBe("advise");
  });
});

describe("isTaskCacheValid", () => {
  it("success=true이고 최근이면 auto", () => {
    const result = {
      success: true,
      completed_at: new Date().toISOString(),
    };
    expect(isTaskCacheValid(result)).toBe("auto");
  });

  it("success=false이면 skip", () => {
    expect(isTaskCacheValid({ success: false })).toBe("skip");
  });

  it("completed_at TTL 초과 시 skip", () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    expect(isTaskCacheValid({ success: true, completed_at: old }, { recencyDays: 7 })).toBe("skip");
  });

  it("completed_at 없어도 success=true면 auto", () => {
    expect(isTaskCacheValid({ success: true })).toBe("auto");
  });

  it("adapter 불일치 시 advise (stamp 있는 task)", () => {
    expect(isTaskCacheValid({ success: true, adapter: "codex" }, { expected_adapter: "claude" })).toBe("advise");
  });

  it("adapter 일치 시 auto", () => {
    expect(isTaskCacheValid({ success: true, adapter: "claude" }, { expected_adapter: "claude" })).toBe("auto");
  });

  it("stamp 없는 구 task는 adapter 불일치여도 auto (후방 호환)", () => {
    expect(isTaskCacheValid({ success: true }, { expected_adapter: "claude" })).toBe("auto");
  });

  it("git_head 불일치 시 advise (stamp 있는 task)", () => {
    expect(isTaskCacheValid({ success: true, git_head: "aabbccdd" }, { expected_git_head: "11223344" })).toBe("advise");
  });
});
