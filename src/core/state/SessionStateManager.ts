import { promises as fs } from 'fs';
import { join } from 'path';
import { ZodError } from 'zod';
import type { SessionState, Checkpoint } from '../../schemas/pipeline.js';
import { SessionStateSchema, CheckpointSchema } from '../../schemas/pipeline.js';
import { StateValidator } from './StateValidator.js';
import { ExecutionResultNormalizer } from './ExecutionResultNormalizer.js';
import { ContextCompressor } from '../context/ContextCompressor.js';
import { StateIOError, StateValidationError } from '../errors/StateErrors.js';
import { logger } from '../utils/logger.js';

const STATE_DIR = '.state';
const SESSIONS_DIR = join(STATE_DIR, 'sessions');
const CHECKPOINTS_DIR = join(STATE_DIR, 'checkpoints');

export class SessionStateManager {
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
    try {
      await this.ensureDirectories();

      // 1. 자동 정규화: task_results의 원시 데이터를 표준 스키마로 보정
      for (const [taskId, result] of Object.entries(state.task_results)) {
        const res = result as any;
        // 이미 정규화된 데이터가 아니라면(예: summary가 없거나 raw_output만 있다면) 보정 시도
        if (!res.task_id || !res.summary) {
          state.task_results[taskId] = ExecutionResultNormalizer.normalize(taskId, res);
        }
      }

      // 2. 자동 실패 트래킹: shared_context.failed_task_ids 동기화
      const failedIds = new Set((state.shared_context?.failed_task_ids as string[]) || []);
      for (const [taskId, result] of Object.entries(state.task_results)) {
        const res = result as any;
        if (res.success === false) {
          failedIds.add(taskId);
        }
      }
      state.shared_context.failed_task_ids = Array.from(failedIds);

      // 3. 자동 압축: 토큰 임계 초과 시 오래된 결과 압축
      const compressedState = ContextCompressor.compress(state);

      // 4. 최종 무결성 검증
      const validated = StateValidator.validate(compressedState);
      
      const filePath = join(SESSIONS_DIR, `${sessionId}.json`);
      await fs.writeFile(filePath, JSON.stringify(validated, null, 2));
    } catch (error: any) {
      if (error instanceof StateValidationError) throw error;
      throw new StateIOError(`Failed to save session [${sessionId}]`, {
        sessionId,
        originalError: error.message
      });
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
            logger.warn(`Failed to load checkpoint file [${file}], skipping.`, e);
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
