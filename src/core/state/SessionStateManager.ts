import { promises as fs } from 'fs';
import { join } from 'path';
import { ZodError } from 'zod';
import type { SessionState, Checkpoint } from '../../schemas/pipeline.js';
import { SessionStateSchema, CheckpointSchema } from '../../schemas/pipeline.js';
import { StateValidator } from './StateValidator.js';
import { ExecutionResultNormalizer } from './ExecutionResultNormalizer.js';
import { ContextCompressor } from '../context/ContextCompressor.js';
import { StateIOError, StateValidationError, StateLockError } from '../errors/StateErrors.js';
import { logger } from '../utils/logger.js';
import { translateVisibleText } from '../utils/visibleText.js';
import {
  resolveCheckpointsDir as resolveProjectCheckpointsDir,
  resolveLegacyCheckpointsDir,
  resolveLegacySessionsDir,
  resolveSessionsDir as resolveProjectSessionsDir,
} from './storage-paths.js';

// sessionId는 파일 경로로 직접 사용되므로 안전한 형식만 허용한다.
const SESSION_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function assertSafeSessionId(id: string): void {
  if (!SESSION_ID_RE.test(id)) {
    throw new StateIOError(
      `Invalid session ID "${id}" — only alphanumeric, underscore, hyphen (max 64 chars) are allowed`,
      { sessionId: id },
    );
  }
}

export function resolveSessionsDir(cwd?: string): string {
  return resolveProjectSessionsDir(cwd);
}

const LOCK_STALE_TIMEOUT_MS = 5_000;
const MAX_LOCK_RETRIES = 3;

export interface ProjectInfo {
  projectId: string;
  projectPath: string;
  projectName: string;
}

export class SessionStateManager {
  private static sessionDir(cwd?: string): string {
    return resolveProjectSessionsDir(cwd);
  }

  private static checkpointDir(cwd?: string): string {
    return resolveProjectCheckpointsDir(cwd);
  }

  private static lockPath(sessionId: string, cwd?: string): string {
    return join(this.sessionDir(cwd), `${sessionId}.lock`);
  }

  private static tmpPath(sessionId: string, cwd?: string): string {
    return join(this.sessionDir(cwd), `${sessionId}.tmp.json`);
  }

  private static sessionFilePath(sessionId: string, cwd?: string): string {
    return join(this.sessionDir(cwd), `${sessionId}.json`);
  }

  private static checkpointFilePath(checkpointId: string, cwd?: string): string {
    return join(this.checkpointDir(cwd), `${checkpointId}.json`);
  }

  private static uniqueDirs(directories: string[]): string[] {
    return Array.from(new Set(directories));
  }

  private static sessionDirCandidates(cwd?: string): string[] {
    return this.uniqueDirs([
      this.sessionDir(cwd),
      resolveLegacySessionsDir(cwd),
    ]);
  }

  private static checkpointDirCandidates(cwd?: string): string[] {
    return this.uniqueDirs([
      this.checkpointDir(cwd),
      resolveLegacyCheckpointsDir(cwd),
    ]);
  }

  private static async resolveExistingFilePath(
    fileName: string,
    directories: string[],
  ): Promise<string | null> {
    for (const dir of directories) {
      const filePath = join(dir, fileName);
      try {
        await fs.access(filePath);
        return filePath;
      } catch {
        continue;
      }
    }
    return null;
  }

  private static async listExistingFilePaths(
    directories: string[],
    suffix = '.json',
  ): Promise<string[]> {
    const fileMap = new Map<string, string>();

    for (const dir of directories) {
      try {
        const files = await fs.readdir(dir);
        for (const file of files) {
          if (!file.endsWith(suffix)) continue;
          if (!fileMap.has(file)) {
            fileMap.set(file, join(dir, file));
          }
        }
      } catch (error: unknown) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === 'ENOENT') continue;
        throw error;
      }
    }

    return Array.from(fileMap.values());
  }

  private static isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private static async acquireLock(sessionId: string, cwd?: string, retryDepth = 0): Promise<void> {
    if (retryDepth > MAX_LOCK_RETRIES) {
      throw new StateLockError(
        `Lock acquisition failed for session [${sessionId}] after ${MAX_LOCK_RETRIES} retries`,
        { sessionId, retryDepth },
      );
    }

    const lockFile = this.lockPath(sessionId, cwd);
    let fd: fs.FileHandle | undefined;
    try {
      // O_EXCL: 파일이 이미 존재하면 즉시 실패 — atomic check-and-create
      fd = await fs.open(lockFile, 'wx');
      // PID를 기록해 다른 인스턴스가 lock 보유자 생존 여부를 확인할 수 있게 한다.
      await fd.writeFile(String(process.pid));
    } catch (error: unknown) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'EEXIST') {
        // 잠금 파일 존재 — stale 여부 확인 (PID 우선, mtime 보조)
        try {
          const [content, stat] = await Promise.all([
            fs.readFile(lockFile, 'utf8').catch(() => ''),
            fs.stat(lockFile),
          ]);
          const ownerPid = parseInt(content.trim(), 10);
          const isStale =
            // 보유 프로세스가 이미 종료된 경우
            (!isNaN(ownerPid) && !this.isProcessAlive(ownerPid)) ||
            // PID를 읽을 수 없거나 타임아웃을 넘긴 경우 (보조 조건)
            (isNaN(ownerPid) && Date.now() - stat.mtimeMs > LOCK_STALE_TIMEOUT_MS);
          if (isStale) {
            await fs.unlink(lockFile);
            return this.acquireLock(sessionId, cwd, retryDepth + 1);
          }
        } catch {
          // stat 사이에 잠금 파일이 사라진 경우 — 재시도
          return this.acquireLock(sessionId, cwd, retryDepth + 1);
        }
        throw new StateLockError(
          `Session [${sessionId}] is locked by another process`,
          { sessionId },
        );
      }
      if (nodeError.code === 'ENOENT') {
        // 테스트 병렬 실행 또는 외부 정리 작업이 ensureDirectories 이후
        // 세션 디렉터리를 제거한 경우, 디렉터리를 재생성하고 제한적으로 재시도한다.
        await fs.mkdir(this.sessionDir(cwd), { recursive: true });
        return this.acquireLock(sessionId, cwd, retryDepth + 1);
      }
      throw new StateIOError(`Failed to create lock file for session [${sessionId}]`, {
        sessionId,
        originalError: nodeError.message,
        errorCode: nodeError.code,
      });
    } finally {
      await fd?.close();
    }
  }

  private static async releaseLock(sessionId: string, cwd?: string): Promise<void> {
    try {
      await fs.unlink(this.lockPath(sessionId, cwd));
    } catch {
      // 이미 해제된 잠금 — 무시
    }
  }

  private static ensureDirectories = async (cwd?: string) => {
    try {
      await fs.mkdir(this.sessionDir(cwd), { recursive: true });
      await fs.mkdir(this.checkpointDir(cwd), { recursive: true });
    } catch (error: any) {
      throw new StateIOError(`Failed to create state directories`, {
        path: this.sessionDir(cwd),
        originalError: error.message
      });
    }
  };

  static async saveSession(state: SessionState, cwd?: string): Promise<void> {
    const sessionId = state.shared_context?.session_id as string || 'default';
    assertSafeSessionId(sessionId);
    await this.ensureDirectories(cwd);
    await this.acquireLock(sessionId, cwd);
    try {
      // 1. 자동 정규화: task_results의 원시 데이터를 표준 스키마로 보정
      for (const [taskId, result] of Object.entries(state.task_results)) {
        const res = result as any;
        if (!res.task_id || !res.summary) {
          state.task_results[taskId] = ExecutionResultNormalizer.normalize(taskId, res);
        }
      }

      // 2. 자동 실패 트래킹: shared_context.failed_task_ids 동기화
      const failedIds = new Set<string>();
      for (const [taskId, result] of Object.entries(state.task_results)) {
        const res = result as any;
        if (res.success === false) failedIds.add(taskId);
      }
      state.shared_context.failed_task_ids = Array.from(failedIds);

      // 3. 자동 압축: 토큰 임계 초과 시 오래된 결과 압축
      const compressedState = ContextCompressor.compress(state);

      // 4. 최종 무결성 검증
      const validated = StateValidator.validate(compressedState);

      // 5. tmp→rename atomic write: 덮어쓰기 도중 crash나도 기존 파일 보존
      const tmpFile = this.tmpPath(sessionId, cwd);
      const finalFile = this.sessionFilePath(sessionId, cwd);
      try {
        await fs.writeFile(tmpFile, JSON.stringify(validated, null, 2));
        await fs.rename(tmpFile, finalFile);
      } catch (error: unknown) {
        const nodeError = error as NodeJS.ErrnoException;
        // tmp 파일이 남아있을 경우 정리
        await fs.unlink(tmpFile).catch(() => undefined);
        const recoverable = ['ENOSPC', 'EMFILE', 'ENFILE'].includes(nodeError.code ?? '');
        throw new StateIOError(
          `Failed to write session file [${sessionId}]${recoverable ? ' (recoverable)' : ''}`,
          { sessionId, errorCode: nodeError.code, originalError: nodeError.message },
        );
      }
    } catch (error: unknown) {
      if (error instanceof StateValidationError || error instanceof StateIOError) throw error;
      const e = error as Error;
      throw new StateIOError(`Failed to save session [${sessionId}]`, {
        sessionId,
        originalError: e.message,
      });
    } finally {
      await this.releaseLock(sessionId, cwd);
    }
  }

  static async loadSession(sessionId: string, cwd?: string): Promise<SessionState> {
    assertSafeSessionId(sessionId);
    const filePath =
      await this.resolveExistingFilePath(`${sessionId}.json`, this.sessionDirCandidates(cwd))
      ?? this.sessionFilePath(sessionId, cwd);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      return StateValidator.validate(parsed);
    } catch (error: unknown) {
      if (error instanceof StateValidationError) throw error;
      if (error instanceof SyntaxError) {
        throw new StateIOError(`Session file [${sessionId}] is corrupted`, {
          sessionId, path: filePath, originalError: error.message
        });
      }
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        throw new StateIOError(`Session file not found [${sessionId}]`, {
          sessionId, path: filePath, errorCode: 'ENOENT'
        });
      }
      if (nodeError.code === 'EACCES') {
        throw new StateIOError(`Permission denied reading session [${sessionId}]`, {
          sessionId, path: filePath, errorCode: 'EACCES'
        });
      }
      throw new StateIOError(`Failed to load session [${sessionId}]`, {
        sessionId, path: filePath, originalError: error instanceof Error ? error.message : String(error)
      });
    }
  }


  static async sessionExists(sessionId: string, cwd?: string): Promise<boolean> {
    assertSafeSessionId(sessionId);
    const filePath = await this.resolveExistingFilePath(
      `${sessionId}.json`,
      this.sessionDirCandidates(cwd),
    );
    return filePath !== null;
  }


  static async forkSession(sourceSessionId: string, newSessionId: string, cwd?: string): Promise<SessionState> {
    assertSafeSessionId(sourceSessionId);
    assertSafeSessionId(newSessionId);
    if (!(await this.sessionExists(sourceSessionId, cwd))) {
      throw new StateIOError(`Session file not found [${sourceSessionId}]`, {
        sessionId: sourceSessionId,
        errorCode: 'ENOENT'
      });
    }

    if (await this.sessionExists(newSessionId, cwd)) {
      throw new StateIOError(`Session already exists [${newSessionId}]`, {
        sessionId: newSessionId,
        errorCode: 'EEXIST'
      });
    }

    const source = await this.loadSession(sourceSessionId, cwd);
    const forked = SessionStateSchema.parse({
      ...JSON.parse(JSON.stringify(source)),
      shared_context: {
        ...source.shared_context,
        session_id: newSessionId,
      },
    });

    await this.saveSession(forked, cwd);
    return forked;
  }

  static async listSessions(cwd?: string): Promise<Array<{
    id: string;
    updatedAt: string | null;
    currentTaskId: string | null;
    completedTaskCount: number;
    taskResultCount: number;
    nextAction: string | null;
  }>> {
    try {
      const sessions: Array<{
        id: string;
        updatedAt: string | null;
        currentTaskId: string | null;
        completedTaskCount: number;
        taskResultCount: number;
        nextAction: string | null;
      }> = [];

      const files = await this.listExistingFilePaths(this.sessionDirCandidates(cwd));
      for (const filePath of files) {
        const fileName = filePath.split('/').pop() ?? filePath;
        try {
          const data = await fs.readFile(filePath, 'utf-8');
          const state = SessionStateSchema.parse(JSON.parse(data));
          sessions.push({
            id: fileName.slice(0, -'.json'.length),
            updatedAt: state.updated_at ?? null,
            currentTaskId: state.current_task_id ?? null,
            completedTaskCount: state.completed_task_ids.length,
            taskResultCount: Object.keys(state.task_results).length,
            nextAction: state.next_action ?? null,
          });
        } catch (e) {
          logger.info(
            `세션 파일 [${fileName}]을 불러오지 못해 건너뜁니다. ${translateVisibleText(e instanceof Error ? e.message : String(e))}`,
          );
        }
      }

      return sessions.sort((a, b) => {
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTime - aTime || a.id.localeCompare(b.id);
      });
    } catch (error: unknown) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        return [];
      }
      throw new StateIOError(`Failed to list sessions`, {
        originalError: error instanceof Error ? error.message : String(error)
      });
    }
  }

  static async createCheckpoint(checkpoint: Checkpoint, cwd?: string): Promise<void> {
    try {
      await this.ensureDirectories(cwd);
      const validated = CheckpointSchema.parse(checkpoint);
      const filePath = this.checkpointFilePath(validated.id, cwd);
      await fs.writeFile(filePath, JSON.stringify(validated, null, 2));
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        throw new StateValidationError(`Checkpoint validation failed`, {
          checkpointId: checkpoint.id,
          zodErrors: error.issues
        });
      }
      throw new StateIOError(`Failed to create checkpoint [${checkpoint.id}]`, {
        checkpointId: checkpoint.id,
        originalError: error instanceof Error ? error.message : String(error)
      });
    }
  }

  static async loadCheckpoint(checkpointId: string, cwd?: string): Promise<Checkpoint> {
    const filePath =
      await this.resolveExistingFilePath(`${checkpointId}.json`, this.checkpointDirCandidates(cwd))
      ?? this.checkpointFilePath(checkpointId, cwd);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      return CheckpointSchema.parse(parsed);
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        throw new StateValidationError(`Checkpoint [${checkpointId}] data is invalid`, {
          checkpointId,
          zodErrors: error.issues
        });
      }
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        throw new StateIOError(`Checkpoint file not found [${checkpointId}]`, {
          checkpointId, path: filePath, errorCode: 'ENOENT'
        });
      }
      throw new StateIOError(`Failed to load checkpoint [${checkpointId}]`, {
        checkpointId, path: filePath, originalError: error instanceof Error ? error.message : String(error)
      });
    }
  }

  static async listCheckpoints(sessionId: string, cwd?: string): Promise<Checkpoint[]> {
    try {
      const checkpoints: Checkpoint[] = [];
      const filePaths = await this.listExistingFilePaths(this.checkpointDirCandidates(cwd));

      for (const filePath of filePaths) {
        try {
          const data = await fs.readFile(filePath, 'utf-8');
          const parsed = JSON.parse(data);
          const checkpoint = CheckpointSchema.parse(parsed);
          if (checkpoint.id.startsWith(sessionId)) {
            checkpoints.push(checkpoint);
          }
        } catch (e) {
          const file = filePath.split('/').pop() ?? filePath;
          logger.warn(
            `체크포인트 파일 [${file}]을 불러오지 못해 건너뜁니다. ${translateVisibleText(e instanceof Error ? e.message : String(e))}`,
          );
          continue;
        }
      }

      return checkpoints.sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    } catch (error: any) {
      throw new StateIOError(`Failed to list checkpoints for session [${sessionId}]`, {
        sessionId,
        originalError: error.message
      });
    }
  }

  static async findSuccessfulSessionByInputHash(
    hash: string,
    opts: { project_id?: string; recencyDays?: number; adapter?: string; cwd?: string } = {},
  ): Promise<SessionState | null> {
    const { project_id, recencyDays = 7, adapter, cwd } = opts;
    const cutoff = Date.now() - recencyDays * 24 * 60 * 60 * 1000;

    try {
      const files = await this.listExistingFilePaths(this.sessionDirCandidates(cwd));
      for (const filePath of files) {
        try {
          const data = await fs.readFile(filePath, "utf-8");
          const state = SessionStateSchema.parse(JSON.parse(data));

          if (state.shared_context.raw_input_hash !== hash) continue;
          if (project_id && state.shared_context.project_id !== project_id) continue;
          if (state.updated_at && new Date(state.updated_at).getTime() < cutoff) continue;
          if (state.completed_task_ids.length === 0) continue;

          const failedIds = (state.shared_context.failed_task_ids as string[] | undefined) ?? [];
          if (failedIds.length > 0) continue;

          // 구 세션(adapter stamp 없음)은 필드 자체가 없으므로 비교 없이 통과
          const ctx = state.shared_context as Record<string, unknown>;
          if (adapter && ctx.adapter && ctx.adapter !== adapter) continue;

          return state;
        } catch {
          continue;
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  static async findSuccessfulTaskByHash(
    taskHash: string,
    opts: { project_id?: string; recencyDays?: number; adapter?: string; git_head?: string; cwd?: string } = {},
  ): Promise<{ taskResult: Record<string, unknown>; sessionId: string } | null> {
    const { project_id, recencyDays = 7, adapter, git_head, cwd } = opts;
    const cutoff = Date.now() - recencyDays * 24 * 60 * 60 * 1000;

    try {
      const files = await this.listExistingFilePaths(this.sessionDirCandidates(cwd));
      for (const filePath of files) {
        try {
          const data = await fs.readFile(filePath, "utf-8");
          const state = SessionStateSchema.parse(JSON.parse(data));

          if (project_id && state.shared_context.project_id !== project_id) continue;
          if (state.updated_at && new Date(state.updated_at).getTime() < cutoff) continue;

          for (const taskResult of Object.values(state.task_results)) {
            const res = taskResult as Record<string, unknown>;
            if (res.input_hash !== taskHash) continue;
            if (res.success !== true) continue;
            if (typeof res.completed_at === "string") {
              if (new Date(res.completed_at).getTime() < cutoff) continue;
            }
            // 구 세션(stamp 필드 없음)은 필드 자체가 없으므로 비교 없이 통과
            if (adapter && res.adapter && res.adapter !== adapter) continue;
            if (git_head && res.git_head && res.git_head !== git_head) continue;
            const file = filePath.split('/').pop() ?? filePath;
            return { taskResult: res, sessionId: file.slice(0, -".json".length) };
          }
        } catch {
          continue;
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  static async findIncompleteSessionByInputHash(
    hash: string,
    opts: { project_id?: string; recencyHours?: number; cwd?: string } = {},
  ): Promise<SessionState | null> {
    const { project_id, recencyHours = 24, cwd } = opts;
    const cutoff = Date.now() - recencyHours * 60 * 60 * 1000;

    try {
      const files = await this.listExistingFilePaths(this.sessionDirCandidates(cwd));
      for (const filePath of files) {
        try {
          const data = await fs.readFile(filePath, "utf-8");
          const state = SessionStateSchema.parse(JSON.parse(data));

          if (state.shared_context.raw_input_hash !== hash) continue;
          if (project_id && state.shared_context.project_id !== project_id) continue;
          if (state.updated_at && new Date(state.updated_at).getTime() < cutoff) continue;
          if (state.current_task_id === null) continue;
          if (state.completed_task_ids.length === 0) continue;

          return state;
        } catch {
          continue;
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  static async deleteSession(sessionId: string, cwd?: string): Promise<void> {
    assertSafeSessionId(sessionId);
    try {
      const filePath =
        await this.resolveExistingFilePath(`${sessionId}.json`, this.sessionDirCandidates(cwd))
        ?? this.sessionFilePath(sessionId, cwd);
      await fs.unlink(filePath);
    } catch (error: any) {
      throw new StateIOError(`Failed to delete session [${sessionId}]`, {
        sessionId,
        originalError: error.message
      });
    }
  }

  static async getLatestCheckpoint(sessionId: string, cwd?: string): Promise<Checkpoint | undefined> {
    try {
      const checkpoints = await this.listCheckpoints(sessionId, cwd);
      return checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : undefined;
    } catch (error: any) {
      if (error instanceof StateIOError) throw error;
      throw new StateIOError(`Failed to get latest checkpoint for [${sessionId}]`, {
        sessionId,
        originalError: error.message
      });
    }
  }
}
