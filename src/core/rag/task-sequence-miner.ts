import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export interface SequencePattern {
  sequence: string[];
  count: number;
  sessions: string[];
}

interface MineOptions {
  minCount?: number;
  maxLen?: number;
}

export class TaskSequenceMiner {
  constructor(private readonly sessionsDir: string) {}

  async mine(opts: MineOptions = {}): Promise<SequencePattern[]> {
    const { minCount = 1, maxLen = 3 } = opts;
    const patternMap = new Map<string, { count: number; sessions: string[] }>();

    let files: string[];
    try {
      files = await readdir(this.sessionsDir);
    } catch {
      return [];
    }

    for (const file of files) {
      if (!file.endsWith(".json") || file.endsWith(".tmp.json")) continue;
      try {
        const raw = await readFile(join(this.sessionsDir, file), "utf-8");
        const session = JSON.parse(raw) as {
          shared_context?: { session_id?: string };
          completed_task_ids?: string[];
          task_results?: Record<string, { type?: string }>;
        };
        const sessionId = session.shared_context?.session_id ?? file.replace(".json", "");
        const completedIds = session.completed_task_ids ?? [];
        const typeSeq = completedIds.map(
          (id) => session.task_results?.[id]?.type ?? "UNKNOWN",
        );

        for (let n = 2; n <= Math.min(maxLen, typeSeq.length); n++) {
          for (let i = 0; i <= typeSeq.length - n; i++) {
            const ngram = typeSeq.slice(i, i + n);
            const key = ngram.join("→");
            const entry = patternMap.get(key);
            if (entry) {
              entry.count++;
              if (!entry.sessions.includes(sessionId)) entry.sessions.push(sessionId);
            } else {
              patternMap.set(key, { count: 1, sessions: [sessionId] });
            }
          }
        }
      } catch {
        // unreadable or malformed — skip
      }
    }

    return [...patternMap.entries()]
      .filter(([, v]) => v.count >= minCount)
      .map(([key, v]) => ({ sequence: key.split("→"), count: v.count, sessions: v.sessions }))
      .sort((a, b) => b.count - a.count);
  }

  async predictNext(currentSequence: string[]): Promise<string | undefined> {
    const patterns = await this.mine();
    const tail = currentSequence.slice(-2);

    // bigram match first (last 2 → next), then unigram (last 1 → next)
    for (const prefixLen of [2, 1]) {
      const prefix = tail.slice(-prefixLen);
      if (prefix.length < prefixLen) continue;
      const prefixStr = prefix.join("→") + "→";

      const candidates = new Map<string, number>();
      for (const p of patterns) {
        if (p.sequence.length !== prefixLen + 1) continue;
        if (p.sequence.slice(0, prefixLen).join("→") === prefix.join("→")) {
          const next = p.sequence[prefixLen]!;
          candidates.set(next, (candidates.get(next) ?? 0) + p.count);
        }
      }
      void prefixStr;
      if (candidates.size > 0) {
        return [...candidates.entries()].sort((a, b) => b[1] - a[1])[0]![0];
      }
    }
    return undefined;
  }
}
