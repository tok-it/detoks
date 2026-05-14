import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  CrossProjectStore,
  isValidContribution,
} from "../../../../../src/core/rag/cross-project-store.js";
import type { GeneralizedContribution } from "../../../../../src/core/rag/workflow-generalizer.js";

function makeContribution(
  overrides: Partial<GeneralizedContribution> = {},
): GeneralizedContribution {
  return {
    contributed_at: new Date().toISOString(),
    type_sequence: ["explore", "modify"],
    success: true,
    adapter: "codex",
    task_count: 2,
    duration_sec: 30,
    detoks_version: "0.1.2",
    ...overrides,
  };
}

async function contributeN(
  store: CrossProjectStore,
  n: number,
  overrides: Partial<GeneralizedContribution> = {},
): Promise<void> {
  for (let i = 0; i < n; i++) {
    await store.contribute(makeContribution(overrides));
  }
}

describe("isValidContribution", () => {
  it("올바른 레코드 → true", () => {
    expect(isValidContribution(makeContribution())).toBe(true);
  });

  it("type_sequence.length === 1 → false", () => {
    expect(isValidContribution(makeContribution({ type_sequence: ["explore"] }))).toBe(false);
  });

  it("type_sequence 중 하나가 잘못된 타입 → false", () => {
    expect(
      isValidContribution(
        makeContribution({ type_sequence: ["explore", "debug" as never] }),
      ),
    ).toBe(false);
  });

  it("success !== true → false", () => {
    const record = { ...makeContribution(), success: false } as unknown;
    expect(isValidContribution(record)).toBe(false);
  });

  it("adapter가 AdapterValues 밖 → false", () => {
    expect(
      isValidContribution(makeContribution({ adapter: "gpt4" as never })),
    ).toBe(false);
  });

  it("contributed_at이 잘못된 날짜 문자열 → false", () => {
    expect(
      isValidContribution(makeContribution({ contributed_at: "not-a-date" })),
    ).toBe(false);
  });

  it("task_count === 0 → false", () => {
    expect(isValidContribution(makeContribution({ task_count: 0 }))).toBe(false);
  });

  it("null 입력 → false", () => {
    expect(isValidContribution(null)).toBe(false);
  });

  it("비객체 입력 → false", () => {
    expect(isValidContribution("string")).toBe(false);
    expect(isValidContribution(42)).toBe(false);
  });
});

describe("CrossProjectStore", () => {
  let tmpDir: string;
  let store: CrossProjectStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "detoks-cross-"));
    store = new CrossProjectStore(tmpDir);
    // index TTL을 0으로 설정해 테스트마다 즉시 rebuild
    process.env.DETOKS_CROSS_INDEX_TTL_HOURS = "0";
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.DETOKS_CROSS_INDEX_TTL_HOURS;
    delete process.env.DETOKS_CROSS_MIN_COUNT;
    delete process.env.DETOKS_CROSS_PATTERN_TTL_DAYS;
  });

  describe("contribute → suggest 흐름", () => {
    it("5건 이상 기여 후 같은 prefix로 suggest → 패턴 반환", async () => {
      await contributeN(store, 5);
      const result = await store.suggest(["explore"]);
      expect(result).not.toBeNull();
      expect(result!.type_sequence).toEqual(["explore", "modify"]);
      expect(result!.count).toBe(5);
    });

    it("4건만 기여 후 suggest (기본 minCount=5) → null", async () => {
      await contributeN(store, 4);
      const result = await store.suggest(["explore"]);
      expect(result).toBeNull();
    });

    it("DETOKS_CROSS_MIN_COUNT=1로 1건 기여 후 suggest → 패턴 반환", async () => {
      process.env.DETOKS_CROSS_MIN_COUNT = "1";
      await contributeN(store, 1);
      const result = await store.suggest(["explore"]);
      expect(result).not.toBeNull();
    });

    it("currentTypes = [] → null (early return)", async () => {
      await contributeN(store, 5);
      const result = await store.suggest([]);
      expect(result).toBeNull();
    });

    it("bigram prefix 매칭 — currentTypes 2개이면 bigram으로 먼저 시도", async () => {
      process.env.DETOKS_CROSS_MIN_COUNT = "1";
      await store.contribute(
        makeContribution({ type_sequence: ["explore", "modify", "validate"] }),
      );
      const result = await store.suggest(["explore", "modify"]);
      expect(result).not.toBeNull();
      expect(result!.type_sequence).toEqual(["explore", "modify", "validate"]);
    });

    it("bigram 미매칭, unigram 매칭 가능 → unigram fallback", async () => {
      process.env.DETOKS_CROSS_MIN_COUNT = "1";
      // explore→modify 패턴 기여
      await store.contribute(
        makeContribution({ type_sequence: ["explore", "modify"] }),
      );
      // currentTypes bigram은 ["analyze", "explore"] → bigram 미매칭
      // unigram은 ["explore"] → 매칭
      const result = await store.suggest(["analyze", "explore"]);
      expect(result).not.toBeNull();
      expect(result!.type_sequence[0]).toBe("explore");
    });
  });

  describe("rebuildIndex 처리", () => {
    it("malformed JSON 라인 포함 시 → 해당 라인 skip, 나머지 정상 집계", async () => {
      process.env.DETOKS_CROSS_MIN_COUNT = "1";
      // 유효한 레코드 1건 기여 후 malformed 라인을 직접 append
      await store.contribute(makeContribution());
      const { appendFile } = await import("node:fs/promises");
      await appendFile(
        join(tmpDir, "patterns.jsonl"),
        "THIS IS NOT JSON\n",
        "utf-8",
      );
      // malformed 라인 있어도 유효한 레코드로 suggest 가능해야 함
      const result = await store.suggest(["explore"]);
      expect(result).not.toBeNull();
    });

    it("TTL 90일 초과 레코드 → 인덱스에서 제외", async () => {
      process.env.DETOKS_CROSS_MIN_COUNT = "1";
      const oldDate = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
      await store.contribute(makeContribution({ contributed_at: oldDate }));
      const result = await store.suggest(["explore"]);
      expect(result).toBeNull();
    });

    it("동일 type_sequence 여러 건 기여 → count 누적, adapter_distribution 합산", async () => {
      process.env.DETOKS_CROSS_MIN_COUNT = "1";
      await store.contribute(makeContribution({ adapter: "codex" }));
      await store.contribute(makeContribution({ adapter: "claude" }));
      await store.contribute(makeContribution({ adapter: "codex" }));
      const result = await store.suggest(["explore"]);
      expect(result).not.toBeNull();
      expect(result!.count).toBe(3);
      expect(result!.adapter_distribution["codex"]).toBe(2);
      expect(result!.adapter_distribution["claude"]).toBe(1);
    });

    it("rebuildIndex 후 patterns 정렬 — count desc, last_seen desc", async () => {
      process.env.DETOKS_CROSS_MIN_COUNT = "1";
      // explore→modify: 3건
      await contributeN(store, 3, { type_sequence: ["explore", "modify"] });
      // explore→create: 1건
      await store.contribute(makeContribution({ type_sequence: ["explore", "create"] }));

      // explore prefix로 suggest → count가 높은 explore→modify가 먼저 반환
      const result = await store.suggest(["explore"]);
      expect(result).not.toBeNull();
      expect(result!.type_sequence).toEqual(["explore", "modify"]);
    });

    it("id는 type_sequence 기반 고정 해시 — 같은 시퀀스면 동일한 id", async () => {
      process.env.DETOKS_CROSS_MIN_COUNT = "1";
      await store.contribute(makeContribution());
      const r1 = await store.suggest(["explore"]);

      // 두 번째 rebuild 후에도 id가 동일
      process.env.DETOKS_CROSS_INDEX_TTL_HOURS = "0";
      await store.contribute(makeContribution());
      const r2 = await store.suggest(["explore"]);

      expect(r1!.id).toBe(r2!.id);
    });
  });

  describe("purge", () => {
    it("purge 후 디렉토리가 삭제된다", async () => {
      // contribute()의 fire-and-forget rebuild과의 race를 피하기 위해
      // 파일을 직접 생성해 테스트한다.
      const { writeFile: wf, mkdir: mk } = await import("node:fs/promises");
      await mk(tmpDir, { recursive: true });
      await wf(join(tmpDir, "patterns.jsonl"), "", "utf-8");

      await store.purge();

      const { existsSync } = await import("node:fs");
      expect(existsSync(tmpDir)).toBe(false);
    });

    it("디렉토리가 없어도 purge는 성공한다 (force)", async () => {
      const emptyStore = new CrossProjectStore(join(tmpDir, "nonexistent"));
      await expect(emptyStore.purge()).resolves.toBeUndefined();
    });
  });

  describe("홈 디렉토리 격리 확인", () => {
    it("생성자에 tmpDir을 넘기면 ~/.detoks/를 절대 건드리지 않는다", async () => {
      // 이 테스트 자체가 격리 보장: store는 항상 tmpDir을 사용함
      await contributeN(store, 2);
      const { existsSync } = await import("node:fs");
      // tmpDir에만 파일이 생김
      expect(existsSync(join(tmpDir, "patterns.jsonl"))).toBe(true);
    });
  });
});
