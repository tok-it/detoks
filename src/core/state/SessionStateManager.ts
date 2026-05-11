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

const STATE_DIR = '.state';
const SESSIONS_DIR = join(STATE_DIR, 'sessions');
const CHECKPOINTS_DIR = join(STATE_DIR, 'checkpoints');

const LOCK_STALE_TIMEOUT_MS = 5_000;
const MAX_LOCK_RETRIES = 3;

export interface ProjectInfo {
  projectId: string;
  projectPath: string;
  projectName: string;
}

export class SessionStateManager {
  private static lockPath(sessionId: string): string {
    return join(SESSIONS_DIR, `${sessionId}.lock`);
  }

  private static tmpPath(sessionId: string): string {
    return join(SESSIONS_DIR, `${sessionId}.tmp.json`);
  }

  private static async acquireLock(sessionId: string, retryDepth = 0): Promise<void> {
    if (retryDepth > MAX_LOCK_RETRIES) {
      throw new StateLockError(
        `Lock acquisition failed for session [${sessionId}] after ${MAX_LOCK_RETRIES} retries`,
        { sessionId, retryDepth },
      );
    }

    const lockFile = this.lockPath(sessionId);
    let fd: fs.FileHandle | undefined;
    try {
      // O_EXCL: 파일이 이미 존재하면 즉시 실패 — atomic check-and-create
      fd = await fs.open(lockFile, 'wx');
      await fd.writeFile(String(Date.now()));
    } catch (error: unknown) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'EEXIST') {
        // 잠금 파일 존재 — stale 여부 확인
        try {
          const stat = await fs.stat(lockFile);
          if (Date.now() - stat.mtimeMs > LOCK_STALE_TIMEOUT_MS) {
            await fs.unlink(lockFile);
            return this.acquireLock(sessionId, retryDepth + 1);
          }
        } catch {
          // stat 사이에 잠금 파일이 사라진 경우 — 재시도
          return this.acquireLock(sessionId, retryDepth + 1);
        }
        throw new StateLockError(
          `Session [${sessionId}] is locked by another process`,
          { sessionId },
        );
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

  private static async releaseLock(sessionId: string): Promise<void> {
    try {
      await fs.unlink(this.lockPath(sessionId));
    } catch {
      // 이미 해제된 잠금 — 무시
    }
  }

  private static ensureDirectories = async () => {
    try {
      await fs.mkdir(SESSIONS_DIR, { recursive: true });
      await fs.mkdir(CHECKPOINTS_DIR, { recursive: true });
    } catch (error: any) {
      throw new StateIOError(`Failed to create state directories`, {
        path: STATE_DIR,
        originalError: error.message
      });
    }
  };

  static async saveSession(state: SessionState): Promise<void> {
    const sessionId = state.shared_context?.session_id as string || 'default';
    await this.ensureDirectories();
    await this.acquireLock(sessionId);
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
      const tmpFile = this.tmpPath(sessionId);
      const finalFile = join(SESSIONS_DIR, `${sessionId}.json`);
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
      await this.releaseLock(sessionId);
    }
  }

  static async loadSession(sessionId: string): Promise<SessionState> {
    const filePath = join(SESSIONS_DIR, `${sessionId}.json`);
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


  static async sessionExists(sessionId: string): Promise<boolean> {
    try {
      const filePath = join(SESSIONS_DIR, `${sessionId}.json`);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }


  static async forkSession(sourceSessionId: string, newSessionId: string): Promise<SessionState> {
    if (!(await this.sessionExists(sourceSessionId))) {
      throw new StateIOError(`Session file not found [${sourceSessionId}]`, {
        sessionId: sourceSessionId,
        errorCode: 'ENOENT'
      });
    }

    if (await this.sessionExists(newSessionId)) {
      throw new StateIOError(`Session already exists [${newSessionId}]`, {
        sessionId: newSessionId,
        errorCode: 'EEXIST'
      });
    }

    const source = await this.loadSession(sourceSessionId);
    const forked = SessionStateSchema.parse({
      ...JSON.parse(JSON.stringify(source)),
      shared_context: {
        ...source.shared_context,
        session_id: newSessionId,
      },
    });

    await this.saveSession(forked);
    return forked;
  }

  static async listSessions(): Promise<Array<{
    id: string;
    updatedAt: string | null;
    currentTaskId: string | null;
    completedTaskCount: number;
    taskResultCount: number;
    nextAction: string | null;
  }>> {
    try {
      const files = await fs.readdir(SESSIONS_DIR);
      const sessions: Array<{
        id: string;
        updatedAt: string | null;
        currentTaskId: string | null;
        completedTaskCount: number;
        taskResultCount: number;
        nextAction: string | null;
      }> = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        try {
          const data = await fs.readFile(join(SESSIONS_DIR, file), 'utf-8');
          const state = SessionStateSchema.parse(JSON.parse(data));
          sessions.push({
            id: file.slice(0, -'.json'.length),
            updatedAt: state.updated_at ?? null,
            currentTaskId: state.current_task_id ?? null,
            completedTaskCount: state.completed_task_ids.length,
            taskResultCount: Object.keys(state.task_results).length,
            nextAction: state.next_action ?? null,
          });
        } catch (e) {
          logger.info(
            `세션 파일 [${file}]을 불러오지 못해 건너뜁니다. ${translateVisibleText(e instanceof Error ? e.message : String(e))}`,
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

  static async createCheckpoint(checkpoint: Checkpoint): Promise<void> {
    try {
      await this.ensureDirectories();
      const validated = CheckpointSchema.parse(checkpoint);
      const filePath = join(CHECKPOINTS_DIR, `${validated.id}.json`);
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

  static async loadCheckpoint(checkpointId: string): Promise<Checkpoint> {
    const filePath = join(CHECKPOINTS_DIR, `${checkpointId}.json`);
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

  static async listCheckpoints(sessionId: string): Promise<Checkpoint[]> {
    try {
      await this.ensureDirectories();
      const files = await fs.readdir(CHECKPOINTS_DIR);
      const checkpoints: Checkpoint[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const data = await fs.readFile(join(CHECKPOINTS_DIR, file), 'utf-8');
            const parsed = JSON.parse(data);
            const checkpoint = CheckpointSchema.parse(parsed);
            if (checkpoint.id.startsWith(sessionId)) {
              checkpoints.push(checkpoint);
            }
          } catch (e) {
            logger.warn(
              `체크포인트 파일 [${file}]을 불러오지 못해 건너뜁니다. ${translateVisibleText(e instanceof Error ? e.message : String(e))}`,
            );
            continue;
          }
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

  static async deleteSession(sessionId: string): Promise<void> {
    try {
      const filePath = join(SESSIONS_DIR, `${sessionId}.json`);
      await fs.unlink(filePath);
    } catch (error: any) {
      throw new StateIOError(`Failed to delete session [${sessionId}]`, {
        sessionId,
        originalError: error.message
      });
    }
  }

  static async getLatestCheckpoint(sessionId: string): Promise<Checkpoint | undefined> {
    try {
      const checkpoints = await this.listCheckpoints(sessionId);
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
