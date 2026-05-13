import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AdapterStatsLearner } from "../../../../../src/core/rag/adapter-stats-learner.js";

function writeSession(
  dir: string,
  sessionId: string,
  adapter: string,
  tokenMetrics: {
    input_original_tokens?: number;
    input_optimized_tokens?: number;
    output_original_tokens?: number;
    output_optimized_tokens?: number;
    reduction_ratio?: number;
  } | null,
) {
  writeFileSync(
    join(dir, `${sessionId}.json`),
    JSON.stringify({
      shared_context: {
        session_id: sessionId,
        adapter,
        token_metrics: tokenMetrics,
      },
      completed_task_ids: [],
      task_results: {},
      current_task_id: null,
      updated_at: new Date().toISOString(),
    }),
  );
}

describe("AdapterStatsLearner (F13+F14)", () => {
  let sessionsDir: string;

  beforeEach(() => {
    sessionsDir = mkdtempSync(join(tmpdir(), "detoks-adapter-stats-"));
  });

  afterEach(() => {
    rmSync(sessionsDir, { recursive: true, force: true });
  });

  it("세션이 없으면 빈 통계를 반환한다", async () => {
    const learner = new AdapterStatsLearner(sessionsDir);
    const stats = await learner.learn();
    expect(stats).toHaveLength(0);
  });

  it("adapter별 평균 토큰 사용량을 집계한다", async () => {
    writeSession(sessionsDir, "s1", "claude", {
      input_original_tokens: 1000,
      input_optimized_tokens: 800,
      output_original_tokens: 500,
      output_optimized_tokens: 200,
      reduction_ratio: 0.2,
    });
    writeSession(sessionsDir, "s2", "claude", {
      input_original_tokens: 2000,
      input_optimized_tokens: 1600,
      output_original_tokens: 600,
      output_optimized_tokens: 300,
      reduction_ratio: 0.2,
    });

    const learner = new AdapterStatsLearner(sessionsDir);
    const stats = await learner.learn();

    const claudeStat = stats.find((s) => s.adapter === "claude");
    expect(claudeStat).toBeDefined();
    expect(claudeStat!.sessionCount).toBe(2);
    expect(claudeStat!.avgInputTokens).toBeCloseTo(1500);
    expect(claudeStat!.avgOutputTokens).toBeCloseTo(550);
    expect(claudeStat!.avgReductionRatio).toBeCloseTo(0.2);
  });

  it("여러 adapter를 독립적으로 집계한다", async () => {
    writeSession(sessionsDir, "s1", "claude", {
      input_original_tokens: 1000,
      input_optimized_tokens: 800,
      output_original_tokens: 400,
      output_optimized_tokens: 200,
      reduction_ratio: 0.2,
    });
    writeSession(sessionsDir, "s2", "gemini", {
      input_original_tokens: 500,
      input_optimized_tokens: 400,
      output_original_tokens: 300,
      output_optimized_tokens: 150,
      reduction_ratio: 0.3,
    });

    const learner = new AdapterStatsLearner(sessionsDir);
    const stats = await learner.learn();

    expect(stats.length).toBe(2);
    const adapters = stats.map((s) => s.adapter).sort();
    expect(adapters).toContain("claude");
    expect(adapters).toContain("gemini");
  });

  it("token_metrics가 null인 세션은 건너뛴다", async () => {
    writeSession(sessionsDir, "s1", "claude", null);

    const learner = new AdapterStatsLearner(sessionsDir);
    const stats = await learner.learn();
    expect(stats).toHaveLength(0);
  });

  it("estimateBudget — adapter의 평균 입력 토큰 수를 반환한다", async () => {
    writeSession(sessionsDir, "s1", "codex", {
      input_original_tokens: 2000,
      input_optimized_tokens: 1500,
      output_original_tokens: 800,
      output_optimized_tokens: 400,
      reduction_ratio: 0.25,
    });

    const learner = new AdapterStatsLearner(sessionsDir);
    const budget = await learner.estimateBudget("codex");

    expect(budget).toBeDefined();
    expect(budget!.estimatedInputTokens).toBeCloseTo(2000);
    expect(budget!.estimatedReductionRatio).toBeCloseTo(0.25);
  });

  it("estimateBudget — 기록 없는 adapter는 undefined 반환", async () => {
    const learner = new AdapterStatsLearner(sessionsDir);
    const budget = await learner.estimateBudget("unknown-adapter");
    expect(budget).toBeUndefined();
  });

  it("sessionCount 내림차순으로 정렬된다", async () => {
    writeSession(sessionsDir, "s1", "claude", { input_original_tokens: 1000, input_optimized_tokens: 800, output_original_tokens: 400, output_optimized_tokens: 200, reduction_ratio: 0.2 });
    writeSession(sessionsDir, "s2", "claude", { input_original_tokens: 1000, input_optimized_tokens: 800, output_original_tokens: 400, output_optimized_tokens: 200, reduction_ratio: 0.2 });
    writeSession(sessionsDir, "s3", "gemini", { input_original_tokens: 500, input_optimized_tokens: 400, output_original_tokens: 300, output_optimized_tokens: 150, reduction_ratio: 0.3 });

    const learner = new AdapterStatsLearner(sessionsDir);
    const stats = await learner.learn();

    expect(stats[0]!.adapter).toBe("claude");
    expect(stats[0]!.sessionCount).toBe(2);
  });
});
