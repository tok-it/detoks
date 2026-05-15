import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { SessionStateManager, resolveSessionsDir } from "../../../../../src/core/state/SessionStateManager.js";
import { StateLockError } from "../../../../../src/core/errors/StateErrors.js";
const LOCK_STALE_MS = 5_000;

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

function sessionsDir(tmpDir: string) {
  return resolveSessionsDir(tmpDir);
}

function writeLock(tmpDir: string, sessionId: string, content: string, mtimeOffset = 0) {
  const dir = sessionsDir(tmpDir);
  mkdirSync(dir, { recursive: true });
  const lockPath = join(dir, `${sessionId}.lock`);
  writeFileSync(lockPath, content);
  if (mtimeOffset !== 0) {
    const { utimesSync } = require("node:fs");
    const t = (Date.now() + mtimeOffset) / 1000;
    utimesSync(lockPath, t, t);
  }
  return lockPath;
}

describe("lock PID 스테일 감지", () => {
  let tmpDir: string;
  let origCwd: string;
  let origDetoksHome: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "detoks-lock-test-"));
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
    vi.restoreAllMocks();
  });

  it("잠금 없는 경우 saveSession이 정상 완료", async () => {
    const state = makeMinimalSession("sess-no-lock") as any;
    await expect(SessionStateManager.saveSession(state, tmpDir)).resolves.toBeUndefined();
  });

  it("죽은 PID가 잠금 파일에 있으면 스테일로 처리 — saveSession 성공", async () => {
    // process.kill(pid, 0)이 ESRCH를 던지면 isProcessAlive = false → 스테일
    const deadPid = 99999999;
    writeLock(tmpDir, "sess-stale", String(deadPid));

    // process.kill이 존재하지 않는 PID에 대해 throw하도록 spy
    vi.spyOn(process, "kill").mockImplementation((pid: number, signal?: string | number) => {
      if (signal === 0 && pid === deadPid) {
        const err = Object.assign(new Error("No such process"), { code: "ESRCH" });
        throw err;
      }
      return true;
    });

    const state = makeMinimalSession("sess-stale") as any;
    await expect(SessionStateManager.saveSession(state, tmpDir)).resolves.toBeUndefined();
  });

  it("현재 프로세스 PID가 잠금 파일에 있으면 StateLockError", async () => {
    const alivePid = process.pid;
    writeLock(tmpDir, "sess-live", String(alivePid));

    // process.kill spy: 현재 프로세스에 signal 0은 정상 반환(alive)
    vi.spyOn(process, "kill").mockImplementation((pid: number, signal?: string | number) => {
      if (signal === 0 && pid === alivePid) {
        return true; // alive — does not throw
      }
      return true;
    });

    const state = makeMinimalSession("sess-live") as any;
    await expect(SessionStateManager.saveSession(state, tmpDir)).rejects.toBeInstanceOf(StateLockError);
  });

  it("PID를 읽을 수 없는 잠금 + mtime이 오래된 경우 스테일로 처리 — saveSession 성공", async () => {
    // PID 필드 없음(isNaN = true) + mtime이 LOCK_STALE_TIMEOUT_MS 초과
    const staleOffset = -(LOCK_STALE_MS + 1000); // 현재보다 6초 이전
    writeLock(tmpDir, "sess-no-pid", "not-a-number", staleOffset);

    const state = makeMinimalSession("sess-no-pid") as any;
    await expect(SessionStateManager.saveSession(state, tmpDir)).resolves.toBeUndefined();
  });

  it("PID를 읽을 수 없는 잠금 + mtime이 최근이면 StateLockError", async () => {
    // PID 필드 없음(isNaN = true) + mtime이 LOCK_STALE_TIMEOUT_MS 이내
    writeLock(tmpDir, "sess-fresh-no-pid", "not-a-number"); // 현재 시간 → 최신

    const state = makeMinimalSession("sess-fresh-no-pid") as any;
    await expect(SessionStateManager.saveSession(state, tmpDir)).rejects.toBeInstanceOf(StateLockError);
  });
});
