import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { TaskSequenceMiner } from "./task-sequence-miner.js";

export interface WorkflowTemplate {
  id: string;
  typeSequence: string[];
  count: number;
  samplePrompts: string[];
}

interface BuildOptions {
  minCount?: number;
}

export class WorkflowTemplateBuilder {
  private readonly miner: TaskSequenceMiner;

  constructor(private readonly dir: string) {
    this.miner = new TaskSequenceMiner(dir);
  }

  async build(opts: BuildOptions = {}): Promise<WorkflowTemplate[]> {
    const { minCount = 2 } = opts;
    const patterns = await this.miner.mine({ minCount });
    if (patterns.length === 0) return [];

    const promptMap = await this.loadPrompts();

    return patterns.map((p) => {
      const id = createHash("sha256").update(p.sequence.join("→")).digest("hex").slice(0, 12);
      const samplePrompts = p.sessions
        .map((sid) => promptMap.get(sid))
        .filter((s): s is string => !!s)
        .slice(0, 3);
      return { id, typeSequence: p.sequence, count: p.count, samplePrompts };
    });
  }

  async suggest(currentSequence: string[]): Promise<WorkflowTemplate | undefined> {
    const templates = await this.build({ minCount: 1 });
    const prefix = currentSequence.slice(-2);

    for (const prefixLen of [Math.min(prefix.length, 2), 1]) {
      const p = prefix.slice(-prefixLen);
      if (p.length < prefixLen) continue;
      const match = templates.find(
        (t) =>
          t.typeSequence.length > prefixLen &&
          t.typeSequence.slice(0, prefixLen).join("→") === p.join("→"),
      );
      if (match) return match;
    }
    return undefined;
  }

  private async loadPrompts(): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    let files: string[];
    try {
      files = await readdir(this.dir);
    } catch {
      return map;
    }
    for (const file of files) {
      if (!file.endsWith(".json") || file.endsWith(".tmp.json")) continue;
      try {
        const raw = await readFile(join(this.dir, file), "utf-8");
        const session = JSON.parse(raw) as {
          shared_context?: { session_id?: string; raw_input?: string };
        };
        const sid = session.shared_context?.session_id ?? file.replace(".json", "");
        const prompt = session.shared_context?.raw_input;
        if (prompt) map.set(sid, prompt);
      } catch { /* skip */ }
    }
    return map;
  }
}
