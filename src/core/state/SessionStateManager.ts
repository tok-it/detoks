import { promises as fs } from 'fs';
import { join } from 'path';
import type { SessionState, Checkpoint } from '../../types/index.js';
import { SessionStateSchema, CheckpointSchema } from '../../types/index.js';

const STATE_DIR = '.state';
const SESSIONS_DIR = join(STATE_DIR, 'sessions');
const CHECKPOINTS_DIR = join(STATE_DIR, 'checkpoints');

export class SessionStateManager {
  private static ensureDirectories = async () => {
    try {
      await fs.mkdir(SESSIONS_DIR, { recursive: true });
      await fs.mkdir(CHECKPOINTS_DIR, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create state directories: ${error}`);
    }
  };

  static async saveSession(state: SessionState): Promise<void> {
    try {
      await this.ensureDirectories();
      const validated = SessionStateSchema.parse(state);
      const filePath = join(SESSIONS_DIR, `${validated.session_id}.json`);
      await fs.writeFile(filePath, JSON.stringify(validated, null, 2));
    } catch (error) {
      throw new Error(`Failed to save session: ${error}`);
    }
  }

  static async loadSession(sessionId: string): Promise<SessionState> {
    try {
      const filePath = join(SESSIONS_DIR, `${sessionId}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      return SessionStateSchema.parse(parsed);
    } catch (error) {
      throw new Error(`Failed to load session ${sessionId}: ${error}`);
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
    } catch (error) {
      throw new Error(`Failed to create checkpoint: ${error}`);
    }
  }

  static async loadCheckpoint(checkpointId: string): Promise<Checkpoint> {
    try {
      const filePath = join(CHECKPOINTS_DIR, `${checkpointId}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      return CheckpointSchema.parse(parsed);
    } catch (error) {
      throw new Error(`Failed to load checkpoint ${checkpointId}: ${error}`);
    }
  }

  static async listCheckpoints(sessionId: string): Promise<Checkpoint[]> {
    try {
      await this.ensureDirectories();
      const files = await fs.readdir(CHECKPOINTS_DIR);
      const checkpoints: Checkpoint[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const data = await fs.readFile(join(CHECKPOINTS_DIR, file), 'utf-8');
          const parsed = JSON.parse(data);
          const checkpoint = CheckpointSchema.parse(parsed);
          if (checkpoint.id.startsWith(sessionId)) {
            checkpoints.push(checkpoint);
          }
        }
      }

      return checkpoints.sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    } catch (error) {
      throw new Error(`Failed to list checkpoints: ${error}`);
    }
  }

  static async deleteSession(sessionId: string): Promise<void> {
    try {
      const filePath = join(SESSIONS_DIR, `${sessionId}.json`);
      await fs.unlink(filePath);
    } catch (error) {
      throw new Error(`Failed to delete session ${sessionId}: ${error}`);
    }
  }

  static async getLatestCheckpoint(sessionId: string): Promise<Checkpoint | undefined> {
    try {
      const checkpoints = await this.listCheckpoints(sessionId);
      return checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : undefined;
    } catch (error) {
      throw new Error(`Failed to get latest checkpoint: ${error}`);
    }
  }
}
