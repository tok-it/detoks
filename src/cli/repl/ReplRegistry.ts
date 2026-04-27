import { readFile, writeFile, access } from "node:fs/promises";
import * as path from "node:path";
import { logger } from "../../core/utils/logger.js";

export interface ReplSession {
  project_id: string;
  session_id: string;
  adapter: string;
  execution_mode: string;
  created_at: string;
  last_resumed_at: string;
}

interface ReplRegistryData {
  last_session?: ReplSession;
}

/**
 * ReplRegistry
 *
 * 현재 디렉토리의 마지막 REPL 세션을 추적합니다.
 * .repl-session.json 파일에 저장되며, 프로젝트별로 세션 재개 가능.
 */
export class ReplRegistry {
  private static readonly REGISTRY_FILE = ".repl-session.json";

  /**
   * 프로젝트의 마지막 REPL 세션을 로드합니다.
   */
  static async loadLastSession(
    projectId: string,
    cwd: string = process.cwd()
  ): Promise<ReplSession | null> {
    try {
      const data = await this.readRegistry(cwd);
      if (data?.last_session?.project_id === projectId) {
        logger.info(
          `[ReplRegistry] Loaded session for project ${projectId}: ${data.last_session.session_id}`
        );
        return data.last_session;
      }
      return null;
    } catch (error) {
      logger.warn(`[ReplRegistry] Failed to load last session: ${error}`);
      return null;
    }
  }

  /**
   * REPL 세션을 저장합니다.
   */
  static async saveSession(
    projectId: string,
    sessionId: string,
    adapter: string,
    executionMode: string,
    cwd: string = process.cwd()
  ): Promise<void> {
    try {
      const data = (await this.readRegistry(cwd)) || {};
      data.last_session = {
        project_id: projectId,
        session_id: sessionId,
        adapter,
        execution_mode: executionMode,
        created_at: new Date().toISOString(),
        last_resumed_at: new Date().toISOString(),
      };
      await this.writeRegistry(data, cwd);
      logger.info(
        `[ReplRegistry] Saved session for project ${projectId}: ${sessionId}`
      );
    } catch (error) {
      logger.warn(`[ReplRegistry] Failed to save session: ${error}`);
    }
  }

  /**
   * REPL 세션을 업데이트합니다 (마지막 접근 시간만).
   */
  static async updateLastResumed(
    cwd: string = process.cwd()
  ): Promise<void> {
    try {
      const data = await this.readRegistry(cwd);
      if (data?.last_session) {
        data.last_session.last_resumed_at = new Date().toISOString();
        await this.writeRegistry(data, cwd);
      }
    } catch (error) {
      logger.warn(`[ReplRegistry] Failed to update last_resumed_at: ${error}`);
    }
  }

  private static async readRegistry(
    cwd: string = process.cwd()
  ): Promise<ReplRegistryData | null> {
    const filePath = path.join(cwd, this.REGISTRY_FILE);
    try {
      await access(filePath);
      const content = await readFile(filePath, "utf-8");
      return JSON.parse(content) as ReplRegistryData;
    } catch (error: any) {
      if (error.code === "ENOENT") return null;
      logger.warn(
        `[ReplRegistry] Failed to parse registry file ${filePath}: ${error}`
      );
      return null;
    }
  }

  private static async writeRegistry(
    data: ReplRegistryData,
    cwd: string = process.cwd()
  ): Promise<void> {
    const filePath = path.join(cwd, this.REGISTRY_FILE);
    await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  }
}
