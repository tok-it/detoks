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
  it("유효한 세션은 true 반환", () => {
    expect(isSessionCacheValid(makeSession())).toBe(true);
  });

  it("project_id 불일치 시 false", () => {
    const session = makeSession({ shared_context: { session_id: "s1", project_id: "git-xyz" } });
    expect(isSessionCacheValid(session, { project_id: "git-abc123" })).toBe(false);
  });

  it("project_id 일치 시 true", () => {
    const session = makeSession({ shared_context: { session_id: "s1", project_id: "git-abc123" } });
    expect(isSessionCacheValid(session, { project_id: "git-abc123" })).toBe(true);
  });

  it("failed_task_ids가 있으면 false", () => {
    const session = makeSession({ shared_context: { session_id: "s1", failed_task_ids: ["t1"] } });
    expect(isSessionCacheValid(session)).toBe(false);
  });

  it("completed_task_ids가 비어있으면 false", () => {
    const session = makeSession({ completed_task_ids: [] });
    expect(isSessionCacheValid(session)).toBe(false);
  });

  it("TTL 초과 시 false", () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const session = makeSession({ updated_at: old });
    expect(isSessionCacheValid(session, { recencyDays: 7 })).toBe(false);
  });

  it("TTL 이내이면 true", () => {
    const recent = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const session = makeSession({ updated_at: recent });
    expect(isSessionCacheValid(session, { recencyDays: 7 })).toBe(true);
  });
});

describe("isTaskCacheValid", () => {
  it("success=true이고 최근이면 true", () => {
    const result = {
      success: true,
      completed_at: new Date().toISOString(),
    };
    expect(isTaskCacheValid(result)).toBe(true);
  });

  it("success=false이면 false", () => {
    expect(isTaskCacheValid({ success: false })).toBe(false);
  });

  it("completed_at TTL 초과 시 false", () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    expect(isTaskCacheValid({ success: true, completed_at: old }, { recencyDays: 7 })).toBe(false);
  });

  it("completed_at 없어도 success=true면 통과", () => {
    expect(isTaskCacheValid({ success: true })).toBe(true);
  });
});
