import { createHash, randomBytes } from "node:crypto";
import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RequestCategoryValues, type RequestCategory } from "../../schemas/pipeline.js";
import { AdapterValues, type Adapter } from "../pipeline/types.js";
import type { GeneralizedContribution } from "./workflow-generalizer.js";
import { resolveSharedCrossProjectDir } from "../state/storage-paths.js";

interface CrossProjectPattern {
  id: string;
  type_sequence: RequestCategory[];
  count: number;
  success_rate: number;
  adapter_distribution: Record<string, number>;
  last_seen: string;
}

interface CrossProjectIndex {
  built_at: string;
  total_contributions: number;
  patterns: CrossProjectPattern[];
}

export function isValidContribution(value: unknown): value is GeneralizedContribution {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.type_sequence) &&
    v.type_sequence.length >= 2 &&
    v.type_sequence.every((t: unknown) =>
      RequestCategoryValues.includes(t as RequestCategory),
    ) &&
    v.success === true &&
    AdapterValues.includes(v.adapter as Adapter) &&
    typeof v.contributed_at === "string" &&
    !isNaN(Date.parse(v.contributed_at)) &&
    typeof v.task_count === "number" &&
    v.task_count > 0
  );
}

export class CrossProjectStore {
  private readonly dir: string;

  constructor(dir = resolveSharedCrossProjectDir()) {
    this.dir = dir;
  }

  async contribute(record: GeneralizedContribution): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await appendFile(
      join(this.dir, "patterns.jsonl"),
      JSON.stringify(record) + "\n",
      "utf-8",
    );
    void this.maybeRebuildIndex().catch(() => undefined);
  }

  async suggest(currentTypes: RequestCategory[]): Promise<CrossProjectPattern | null> {
    if (currentTypes.length === 0) return null;

    await this.maybeRebuildIndex().catch(() => undefined);

    const index = await this.loadIndex();
    if (!index) return null;

    const rawMin = parseInt(process.env.DETOKS_CROSS_MIN_COUNT ?? "5", 10);
    const minCount = Math.max(1, isNaN(rawMin) ? 5 : rawMin);
    const rawRate = parseFloat(process.env.DETOKS_CROSS_SUCCESS_RATE ?? "0.6");
    const minSuccessRate = isNaN(rawRate) ? 0.6 : rawRate;

    const prefix = currentTypes.slice(-2);
    const rawLens = [Math.min(prefix.length, 2), 1];
    const prefixLens = rawLens.filter((n, i) => rawLens.indexOf(n) === i && n >= 1);

    for (const prefixLen of prefixLens) {
      const p = prefix.slice(-prefixLen);
      const match = index.patterns.find(
        (pat) =>
          pat.count >= minCount &&
          pat.success_rate >= minSuccessRate &&
          pat.type_sequence.length > prefixLen &&
          pat.type_sequence.slice(0, prefixLen).join("→") === p.join("→"),
      );
      if (match) return match;
    }
    return null;
  }

  async purge(): Promise<void> {
    await rm(this.dir, { recursive: true, force: true });
  }

  private async loadIndex(): Promise<CrossProjectIndex | null> {
    try {
      const raw = await readFile(join(this.dir, "index.json"), "utf-8");
      return JSON.parse(raw) as CrossProjectIndex;
    } catch {
      return null;
    }
  }

  private async maybeRebuildIndex(): Promise<void> {
    const rawTtl = parseFloat(process.env.DETOKS_CROSS_INDEX_TTL_HOURS ?? "6");
    const ttlHours = isNaN(rawTtl) ? 6 : rawTtl;
    const ttlMs = ttlHours * 60 * 60 * 1000;

    const index = await this.loadIndex();
    if (index) {
      const age = Date.now() - new Date(index.built_at).getTime();
      if (age < ttlMs) return;
    }

    await this.rebuildIndex();
  }

  private async rebuildIndex(): Promise<void> {
    const rawDays = parseInt(process.env.DETOKS_CROSS_PATTERN_TTL_DAYS ?? "90", 10);
    const ttlDays = isNaN(rawDays) ? 90 : rawDays;
    const cutoff = new Date(
      Date.now() - ttlDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    let raw = "";
    try {
      raw = await readFile(join(this.dir, "patterns.jsonl"), "utf-8");
    } catch {
      // patterns.jsonl이 없으면 빈 인덱스로 진행
    }

    const validRecords: GeneralizedContribution[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (!isValidContribution(parsed)) continue;
        if (parsed.contributed_at < cutoff) continue;
        validRecords.push(parsed);
      } catch {
        // malformed line skip
      }
    }

    const groups = new Map<
      string,
      {
        type_sequence: RequestCategory[];
        count: number;
        adapter_distribution: Record<string, number>;
        last_seen: string;
      }
    >();

    for (const record of validRecords) {
      const key = record.type_sequence.join("→");
      const existing = groups.get(key);
      if (existing) {
        existing.count++;
        existing.adapter_distribution[record.adapter] =
          (existing.adapter_distribution[record.adapter] ?? 0) + 1;
        if (record.contributed_at > existing.last_seen) {
          existing.last_seen = record.contributed_at;
        }
      } else {
        groups.set(key, {
          type_sequence: record.type_sequence,
          count: 1,
          adapter_distribution: { [record.adapter]: 1 },
          last_seen: record.contributed_at,
        });
      }
    }

    const patterns: CrossProjectPattern[] = Array.from(groups.entries()).map(
      ([key, g]) => ({
        id: createHash("sha256").update(key).digest("hex").slice(0, 12),
        type_sequence: g.type_sequence,
        count: g.count,
        success_rate: 1.0,
        adapter_distribution: g.adapter_distribution,
        last_seen: g.last_seen,
      }),
    );

    patterns.sort(
      (a, b) =>
        b.count - a.count ||
        new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime(),
    );

    const indexData: CrossProjectIndex = {
      built_at: new Date().toISOString(),
      total_contributions: validRecords.length,
      patterns,
    };

    await mkdir(this.dir, { recursive: true });
    const tmpPath = join(
      this.dir,
      `index.${process.pid}.${Date.now()}.${randomBytes(4).toString("hex")}.tmp.json`,
    );
    await writeFile(tmpPath, JSON.stringify(indexData, null, 2), "utf-8");
    await rename(tmpPath, join(this.dir, "index.json"));
  }
}
