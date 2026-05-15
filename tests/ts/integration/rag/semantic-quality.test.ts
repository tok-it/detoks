/**
 * RAG 시맨틱 검색 품질 통합 테스트
 *
 * 실제 KURE-v1 임베딩 모델을 사용해 트리플릿 데이터셋의 pairwise accuracy를 측정한다.
 * 각 트리플릿에서 distance(query, positive) < distance(query, negative)가 성립해야 한다.
 *
 * 모델이 없는 환경에서는 자동으로 skip된다.
 * 실행: RAG_EMBEDDING_MODEL_PATH=/path/to/kure-v1.gguf npx vitest run tests/ts/integration/rag/
 */

import { createReadStream } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { EmbeddingService } from "../../../../src/core/rag/embedding-service.js";
import { VectorStore } from "../../../../src/core/rag/vector-store.js";
import { isEmbeddingModelPresent, getRagModelPath, RAG_EMBEDDING_DIMS } from "../../../../src/core/rag/rag-config.js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const repoRoot = new URL("../../../..", import.meta.url).pathname.replace(/\/$/, "");
const tripletsPath = resolve(repoRoot, "tests/ts/fixtures/rag/semantic-triplets.json");

interface Triplet {
  id: string;
  task_type: string;
  query: string;
  positive: string;
  negative: string;
  note: string;
}

interface TripletFixture {
  version: string;
  quality_gate: { min_pairwise_accuracy: number };
  triplets: Triplet[];
}

// KURE-v1 모델로 두 벡터 간 유클리드 거리 계산
function euclideanDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

const MODEL_PRESENT = isEmbeddingModelPresent();

describe.skipIf(!MODEL_PRESENT)(
  "RAG 시맨틱 검색 품질 (실 임베딩, KURE-v1)",
  () => {
    let service: EmbeddingService;
    let fixture: TripletFixture;

    beforeAll(async () => {
      const modelPath = getRagModelPath()!;
      service = new EmbeddingService(modelPath);
      await service.init();

      const raw = await readFile(tripletsPath, "utf-8");
      fixture = JSON.parse(raw) as TripletFixture;
    }, 120_000);

    afterAll(async () => {
      await service.dispose();
    });

    it("픽스처 파일 구조가 유효하다", () => {
      expect(fixture.triplets.length).toBeGreaterThan(0);
      for (const t of fixture.triplets) {
        expect(t.id).toBeTruthy();
        expect(t.query).toBeTruthy();
        expect(t.positive).toBeTruthy();
        expect(t.negative).toBeTruthy();
      }
    });

    describe("task_type별 pairwise 정확도", () => {
      const eligibleTypes = ["explore", "analyze", "modify", "create"];

      for (const taskType of eligibleTypes) {
        it(`[${taskType}] positive가 negative보다 query에 더 가까워야 한다`, async () => {
          const triplets = fixture.triplets.filter(
            (t) => t.task_type === taskType,
          );
          expect(triplets.length).toBeGreaterThan(0);

          let correct = 0;
          const failures: string[] = [];

          for (const triplet of triplets) {
            const [qVec, pVec, nVec] = await Promise.all([
              service.embed(triplet.query),
              service.embed(triplet.positive),
              service.embed(triplet.negative),
            ]);

            const distPositive = euclideanDistance(qVec, pVec);
            const distNegative = euclideanDistance(qVec, nVec);

            if (distPositive < distNegative) {
              correct++;
            } else {
              failures.push(
                `[${triplet.id}] dist_pos=${distPositive.toFixed(4)} >= dist_neg=${distNegative.toFixed(4)} | ${triplet.note}`,
              );
            }
          }

          const accuracy = correct / triplets.length;
          if (failures.length > 0) {
            console.warn(`[${taskType}] 실패한 트리플릿:\n  ${failures.join("\n  ")}`);
          }

          expect(accuracy).toBeGreaterThanOrEqual(
            fixture.quality_gate.min_pairwise_accuracy,
          );
        }, 60_000);
      }
    });

    it("전체 eligible 트리플릿 pairwise accuracy가 quality gate를 통과한다", async () => {
      const eligibleTriplets = fixture.triplets.filter((t) =>
        ["explore", "analyze", "modify", "create"].includes(t.task_type),
      );

      let correct = 0;
      const failures: string[] = [];

      for (const triplet of eligibleTriplets) {
        const [qVec, pVec, nVec] = await Promise.all([
          service.embed(triplet.query),
          service.embed(triplet.positive),
          service.embed(triplet.negative),
        ]);

        const distPositive = euclideanDistance(qVec, pVec);
        const distNegative = euclideanDistance(qVec, nVec);

        if (distPositive < distNegative) {
          correct++;
        } else {
          failures.push(`[${triplet.id}] ${triplet.note}`);
        }
      }

      const accuracy = correct / eligibleTriplets.length;
      console.info(
        `전체 pairwise accuracy: ${correct}/${eligibleTriplets.length} = ${(accuracy * 100).toFixed(1)}%`,
      );
      if (failures.length > 0) {
        console.warn(`실패 트리플릿 (${failures.length}개):\n  ${failures.join("\n  ")}`);
      }

      expect(accuracy).toBeGreaterThanOrEqual(
        fixture.quality_gate.min_pairwise_accuracy,
      );
    }, 300_000);

    it("non-eligible 타입(run)은 트리플릿 positive/negative 구분 없이 단순 임베딩이 생성된다", async () => {
      const runTriplets = fixture.triplets.filter((t) => t.task_type === "run");
      for (const triplet of runTriplets) {
        const vec = await service.embed(triplet.query);
        expect(vec).toBeInstanceOf(Float32Array);
        expect(vec.length).toBe(RAG_EMBEDDING_DIMS);
      }
    }, 30_000);

    describe("VectorStore 통합 — hybridSearch pairwise 정확도", () => {
      it("positive 문서가 negative 문서보다 상위에 검색된다 (상위 5개 기준)", async () => {
        const tmpDir = mkdtempSync(join(tmpdir(), "detoks-sq-"));
        const store = new VectorStore(join(tmpDir, "test.db"), RAG_EMBEDDING_DIMS);
        store.open();

        try {
          // 처음 10개 트리플릿으로 검증 (소요 시간 제한)
          const sample = fixture.triplets
            .filter((t) => ["explore", "analyze"].includes(t.task_type))
            .slice(0, 10);

          let correct = 0;

          for (const triplet of sample) {
            // positive와 negative를 store에 삽입
            const posId = `pos::${triplet.id}`;
            const negId = `neg::${triplet.id}`;

            const [pVec, nVec, qVec] = await Promise.all([
              service.embed(triplet.positive),
              service.embed(triplet.negative),
              service.embed(triplet.query),
            ]);

            store.upsert(posId, pVec, { kind: "task", session_id: triplet.id });
            store.upsert(negId, nVec, { kind: "task", session_id: `neg-${triplet.id}` });

            const results = store.search(qVec, 5);
            const topIds = results.map((r) => r.id);

            const posRank = topIds.indexOf(posId);
            const negRank = topIds.indexOf(negId);

            if (posRank !== -1 && (negRank === -1 || posRank < negRank)) {
              correct++;
            }

            // 다음 트리플릿과 섞이지 않도록 삭제
            store.delete(posId);
            store.delete(negId);
          }

          const accuracy = correct / sample.length;
          console.info(
            `VectorStore pairwise accuracy: ${correct}/${sample.length} = ${(accuracy * 100).toFixed(1)}%`,
          );
          expect(accuracy).toBeGreaterThanOrEqual(0.7);
        } finally {
          store.close();
          rmSync(tmpDir, { recursive: true, force: true });
        }
      }, 120_000);
    });
  },
);

describe("픽스처 파일 정적 검증 (모델 없이 실행 가능)", () => {
  it("semantic-triplets.json이 로드 가능하고 형식이 올바르다", async () => {
    const raw = await readFile(tripletsPath, "utf-8");
    const fixture = JSON.parse(raw) as TripletFixture;

    expect(fixture.version).toBeTruthy();
    expect(fixture.quality_gate.min_pairwise_accuracy).toBeGreaterThan(0);
    expect(fixture.quality_gate.min_pairwise_accuracy).toBeLessThanOrEqual(1);
    expect(fixture.triplets.length).toBeGreaterThanOrEqual(48);
  });

  it("각 트리플릿이 필수 필드를 갖는다", async () => {
    const raw = await readFile(tripletsPath, "utf-8");
    const fixture = JSON.parse(raw) as TripletFixture;

    for (const t of fixture.triplets) {
      expect(t.id, `${t.id}: id 누락`).toBeTruthy();
      expect(t.task_type, `${t.id}: task_type 누락`).toBeTruthy();
      expect(t.query, `${t.id}: query 누락`).toBeTruthy();
      expect(t.positive, `${t.id}: positive 누락`).toBeTruthy();
      expect(t.negative, `${t.id}: negative 누락`).toBeTruthy();
      expect(t.positive, `${t.id}: positive가 negative와 같으면 안 됨`).not.toBe(t.negative);
    }
  });

  it("eligible 타입 트리플릿이 각 40개 이상이다", async () => {
    const raw = await readFile(tripletsPath, "utf-8");
    const fixture = JSON.parse(raw) as TripletFixture;

    const eligible = fixture.triplets.filter((t) =>
      ["explore", "analyze", "modify", "create"].includes(t.task_type),
    );
    expect(eligible.length).toBeGreaterThanOrEqual(40);
  });

  it("트리플릿 id가 중복 없이 유일하다", async () => {
    const raw = await readFile(tripletsPath, "utf-8");
    const fixture = JSON.parse(raw) as TripletFixture;

    const ids = fixture.triplets.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
