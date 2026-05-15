import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { SessionStateManager } from "../../../../../src/core/state/SessionStateManager.js";
import { StateIOError } from "../../../../../src/core/errors/StateErrors.js";
import { resolveLegacySessionsDir } from "../../../../../src/core/state/storage-paths.js";

function makeMinimalSession(sessionId: string) {
  return {
    shared_context: { session_id: sessionId, failed_task_ids: [] },
    task_results: {
      t1: {
        task_id: "t1",
        success: true,
        raw_output: "ok",
        summary: "ok",
        completed_at: new Date().toISOString(),
      },
    },
    current_task_id: null,
    completed_task_ids: ["t1"],
    updated_at: new Date().toISOString(),
  };
}

function writeSession(dir: string, id: string) {
  const sessDir = resolveLegacySessionsDir(dir);
  mkdirSync(sessDir, { recursive: true });
  writeFileSync(join(sessDir, `${id}.json`), JSON.stringify(makeMinimalSession(id)));
}

describe("sessionId 패턴 검증 (assertSafeSessionId)", () => {
  let tmpDir: string;
  let origCwd: string;
  let origDetoksHome: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "detoks-sid-sec-"));
    origCwd = process.cwd();
    origDetoksHome = process.env.DETOKS_HOME;
    process.env.DETOKS_HOME = join(tmpDir, ".detoks-home");
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    if (origDetoksHome === undefined) {
      delete process.env.DETOKS_HOME;
    } else {
      process.env.DETOKS_HOME = origDetoksHome;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── saveSession ────────────────────────────────────────────────────────────

  it("saveSession — path traversal sessionId는 StateIOError", async () => {
    const state = makeMinimalSession("../../etc/passwd") as any;
    await expect(SessionStateManager.saveSession(state)).rejects.toBeInstanceOf(StateIOError);
  });

  it("saveSession — 슬래시 포함 sessionId는 StateIOError", async () => {
    const state = makeMinimalSession("sessions/evil") as any;
    await expect(SessionStateManager.saveSession(state)).rejects.toBeInstanceOf(StateIOError);
  });

  it("saveSession — 공백 포함 sessionId는 StateIOError", async () => {
    const state = makeMinimalSession("session id") as any;
    await expect(SessionStateManager.saveSession(state)).rejects.toBeInstanceOf(StateIOError);
  });

  it("saveSession — 65자 초과 sessionId는 StateIOError", async () => {
    const longId = "a".repeat(65);
    const state = makeMinimalSession(longId) as any;
    await expect(SessionStateManager.saveSession(state)).rejects.toBeInstanceOf(StateIOError);
  });

  // saveSession은 빈 문자열을 'default'로 fallback하므로 loadSession으로 검증
  it("loadSession — 빈 문자열 sessionId는 StateIOError", async () => {
    await expect(SessionStateManager.loadSession("")).rejects.toBeInstanceOf(StateIOError);
  });

  it("saveSession — 특수문자(@, !, #) sessionId는 StateIOError", async () => {
    const state = makeMinimalSession("sess!on@#") as any;
    await expect(SessionStateManager.saveSession(state)).rejects.toBeInstanceOf(StateIOError);
  });

  // ── loadSession ────────────────────────────────────────────────────────────

  it("loadSession — path traversal sessionId는 StateIOError", async () => {
    await expect(SessionStateManager.loadSession("../../etc/passwd")).rejects.toBeInstanceOf(StateIOError);
  });

  it("loadSession — 특수문자 sessionId는 StateIOError", async () => {
    await expect(SessionStateManager.loadSession("sess!on")).rejects.toBeInstanceOf(StateIOError);
  });

  // ── deleteSession ──────────────────────────────────────────────────────────

  it("deleteSession — path traversal sessionId는 StateIOError", async () => {
    await expect(SessionStateManager.deleteSession("../evil")).rejects.toBeInstanceOf(StateIOError);
  });

  it("deleteSession — 슬래시 포함 sessionId는 StateIOError", async () => {
    await expect(SessionStateManager.deleteSession("a/b")).rejects.toBeInstanceOf(StateIOError);
  });

  // ── forkSession ────────────────────────────────────────────────────────────

  it("forkSession — source sessionId가 invalid이면 StateIOError", async () => {
    await expect(
      SessionStateManager.forkSession("../evil-source", "valid-target"),
    ).rejects.toBeInstanceOf(StateIOError);
  });

  it("forkSession — new sessionId가 invalid이면 StateIOError", async () => {
    writeSession(tmpDir, "valid-source");
    await expect(
      SessionStateManager.forkSession("valid-source", "../evil-target"),
    ).rejects.toBeInstanceOf(StateIOError);
  });

  // ── sessionExists ──────────────────────────────────────────────────────────

  it("sessionExists — path traversal sessionId는 StateIOError", async () => {
    await expect(SessionStateManager.sessionExists("../../etc/passwd")).rejects.toBeInstanceOf(StateIOError);
  });

  it("sessionExists — 특수문자 sessionId는 StateIOError", async () => {
    await expect(SessionStateManager.sessionExists("sess!on")).rejects.toBeInstanceOf(StateIOError);
  });

  // ── 유효한 ID는 허용 ────────────────────────────────────────────────────────

  it("saveSession — 소문자+숫자 sessionId는 통과", async () => {
    const state = makeMinimalSession("sess123") as any;
    await expect(SessionStateManager.saveSession(state)).resolves.toBeUndefined();
  });

  it("saveSession — 하이픈·언더스코어 포함 sessionId는 통과", async () => {
    const state = makeMinimalSession("sess-abc_def") as any;
    await expect(SessionStateManager.saveSession(state)).resolves.toBeUndefined();
  });

  it("saveSession — 정확히 64자 sessionId는 통과", async () => {
    const id = "a".repeat(64);
    const state = makeMinimalSession(id) as any;
    await expect(SessionStateManager.saveSession(state)).resolves.toBeUndefined();
  });

  it("loadSession — 유효한 sessionId로 로드 가능", async () => {
    writeSession(tmpDir, "valid-sess");
    await expect(SessionStateManager.loadSession("valid-sess")).resolves.toBeDefined();
  });
});
