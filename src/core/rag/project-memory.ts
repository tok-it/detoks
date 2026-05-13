import { readFile, readdir, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { TaskSequenceMiner } from "./task-sequence-miner.js";
import { FailurePatternAnalyzer } from "./failure-pattern-analyzer.js";
import { AdapterStatsLearner } from "./adapter-stats-learner.js";
import { WorkflowTemplateBuilder } from "./workflow-template-builder.js";
import type { SequencePattern } from "./task-sequence-miner.js";
import type { FailureStat } from "./failure-pattern-analyzer.js";
import type { AdapterStat } from "./adapter-stats-learner.js";
import type { WorkflowTemplate } from "./workflow-template-builder.js";

export class ProjectMemory {
  constructor(
    private readonly sessionsDir: string,
    private readonly projectId: string | undefined,
  ) {}

  async getSequencePatterns(opts: { minCount?: number } = {}): Promise<SequencePattern[]> {
    return this.withFilteredDir(async (dir) => new TaskSequenceMiner(dir).mine(opts));
  }

  async getFailureStats(): Promise<FailureStat[]> {
    return this.withFilteredDir(async (dir) => new FailurePatternAnalyzer(dir).analyze());
  }

  async getAdapterStats(): Promise<AdapterStat[]> {
    return this.withFilteredDir(async (dir) => new AdapterStatsLearner(dir).learn());
  }

  async getWorkflowSuggestion(currentSequence: string[]): Promise<WorkflowTemplate | undefined> {
    return this.withFilteredDir(async (dir) => new WorkflowTemplateBuilder(dir).suggest(currentSequence));
  }

  private async withFilteredDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const tempDir = join(tmpdir(), `detoks-proj-mem-${randomBytes(6).toString("hex")}`);
    try {
      await mkdir(tempDir, { recursive: true });
      await this.copyFiltered(tempDir);
      return await fn(tempDir);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private async copyFiltered(destDir: string): Promise<void> {
    let files: string[];
    try {
      files = await readdir(this.sessionsDir);
    } catch {
      return;
    }
    for (const file of files) {
      if (!file.endsWith(".json") || file.endsWith(".tmp.json")) continue;
      try {
        const raw = await readFile(join(this.sessionsDir, file), "utf-8");
        const session = JSON.parse(raw) as { shared_context?: { project_id?: string } };
        const sessionProjectId = session.shared_context?.project_id;
        if (this.projectId === undefined ? sessionProjectId === undefined : sessionProjectId === this.projectId) {
          await writeFile(join(destDir, file), raw);
        }
      } catch { /* skip */ }
    }
  }
}
