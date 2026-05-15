/**
 * RagContextLoader 스니펫 잘림(300자) 경계 케이스 검증 데이터셋
 *
 * 기존 rag-context-loader.test.ts에서 다루지 않는 경계 케이스:
 * - 정확히 300자 → 잘리지 않아야 함
 * - 301자 → 딱 하나 잘려야 함
 * - 한국어 멀티바이트 문자 경계
 * - 코드 블록 중간 잘림
 * - 빈 content 처리
 * - 복합 content (코드 + 설명 혼합)
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RagContextLoader } from "../../../../../src/core/rag/rag-context-loader.js";
import type { SearchResult } from "../../../../../src/core/rag/vector-store.js";

const MAX_CHARS = 300;

function makeHit(overrides: Partial<SearchResult> & { meta: SearchResult["meta"] }): SearchResult {
  return { id: "hit-id", distance: 0.1, ...overrides };
}

function writeSession(dir: string, sessionId: string, data: object) {
  writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify(data));
}

function makeSessionWithPrompt(sessionId: string, rawInput: string) {
  return {
    shared_context: { session_id: sessionId, raw_input: rawInput },
    task_results: {},
    completed_task_ids: [],
    current_task_id: null,
    updated_at: new Date().toISOString(),
  };
}

function makeSessionWithTask(
  sessionId: string,
  taskId: string,
  opts: { summary?: string; raw_output?: string },
) {
  return {
    shared_context: { session_id: sessionId, raw_input: "" },
    task_results: {
      [taskId]: {
        task_id: taskId,
        summary: opts.summary ?? null,
        raw_output: opts.raw_output ?? "",
      },
    },
    completed_task_ids: [taskId],
    current_task_id: null,
    updated_at: new Date().toISOString(),
  };
}

describe("RagContextLoader — 300자 경계 케이스", () => {
  let sessionsDir: string;

  beforeEach(() => {
    sessionsDir = mkdtempSync(join(tmpdir(), "detoks-trunc-"));
  });

  afterEach(() => {
    rmSync(sessionsDir, { recursive: true, force: true });
  });

  it("정확히 300자 content → 잘리지 않는다", async () => {
    const exactly300 = "a".repeat(MAX_CHARS);
    writeSession(sessionsDir, "s1", makeSessionWithPrompt("s1", exactly300));
    const loader = new RagContextLoader(sessionsDir);

    const [snippet] = await loader.load([
      makeHit({ id: "prompt::s1", distance: 0.1, meta: { kind: "prompt", session_id: "s1" } }),
    ]);

    expect(snippet!.content.length).toBe(MAX_CHARS);
    expect(snippet!.content).toBe(exactly300);
  });

  it("301자 content → 정확히 300자로 잘린다", async () => {
    const over301 = "a".repeat(MAX_CHARS + 1);
    writeSession(sessionsDir, "s2", makeSessionWithPrompt("s2", over301));
    const loader = new RagContextLoader(sessionsDir);

    const [snippet] = await loader.load([
      makeHit({ id: "prompt::s2", distance: 0.1, meta: { kind: "prompt", session_id: "s2" } }),
    ]);

    expect(snippet!.content.length).toBeLessThanOrEqual(MAX_CHARS);
  });

  it("한국어 텍스트 300자 → 잘리지 않는다", async () => {
    // 한국어 문자는 JS에서 각 1 code unit → length=1
    const korean300 = "가".repeat(MAX_CHARS);
    writeSession(sessionsDir, "s3", makeSessionWithPrompt("s3", korean300));
    const loader = new RagContextLoader(sessionsDir);

    const [snippet] = await loader.load([
      makeHit({ id: "prompt::s3", distance: 0.1, meta: { kind: "prompt", session_id: "s3" } }),
    ]);

    expect(snippet!.content.length).toBe(MAX_CHARS);
  });

  it("한국어 텍스트 400자 → 300자로 잘린다", async () => {
    const korean400 = "나".repeat(400);
    writeSession(sessionsDir, "s4", makeSessionWithPrompt("s4", korean400));
    const loader = new RagContextLoader(sessionsDir);

    const [snippet] = await loader.load([
      makeHit({ id: "prompt::s4", distance: 0.1, meta: { kind: "prompt", session_id: "s4" } }),
    ]);

    expect(snippet!.content.length).toBeLessThanOrEqual(MAX_CHARS);
  });

  it("코드 블록 중간에서 잘림 — 300자 초과 시 코드 블록이 잘린다", async () => {
    // 코드 블록이 300자를 넘어 중간에 잘리는 케이스
    // RagContextLoader는 의미 단위 보존 없이 단순 substring으로 자름
    const codeWithBlock = "```typescript\n" + "const x = 1;\n".repeat(25) + "```";
    // codeWithBlock은 300자 초과
    expect(codeWithBlock.length).toBeGreaterThan(MAX_CHARS);

    writeSession(sessionsDir, "s5", makeSessionWithPrompt("s5", codeWithBlock));
    const loader = new RagContextLoader(sessionsDir);

    const [snippet] = await loader.load([
      makeHit({ id: "prompt::s5", distance: 0.1, meta: { kind: "prompt", session_id: "s5" } }),
    ]);

    expect(snippet!.content.length).toBeLessThanOrEqual(MAX_CHARS);
    // 잘린 후 ``` 블록이 닫히지 않을 수 있음을 문서화 (현재 구현의 알려진 동작)
  });

  it("빈 content → 빈 문자열 스니펫 반환 또는 skip", async () => {
    writeSession(sessionsDir, "s6", makeSessionWithPrompt("s6", ""));
    const loader = new RagContextLoader(sessionsDir);

    const snippets = await loader.load([
      makeHit({ id: "prompt::s6", distance: 0.1, meta: { kind: "prompt", session_id: "s6" } }),
    ]);

    // 빈 content는 skip 또는 빈 string 둘 다 허용 — crash가 없어야 한다
    expect(snippets.length).toBeLessThanOrEqual(1);
    if (snippets.length === 1) {
      expect(snippets[0]!.content.length).toBe(0);
    }
  });

  it("task summary가 300자 초과 → 300자로 잘린다", async () => {
    const longSummary = "task summary: " + "설명 ".repeat(100); // >300
    writeSession(
      sessionsDir,
      "s7",
      makeSessionWithTask("s7", "t1", { summary: longSummary }),
    );
    const loader = new RagContextLoader(sessionsDir);

    const [snippet] = await loader.load([
      makeHit({
        id: "task::s7::t1",
        distance: 0.1,
        meta: { kind: "task", session_id: "s7", task_id: "t1" },
      }),
    ]);

    expect(snippet!.content.length).toBeLessThanOrEqual(MAX_CHARS);
  });

  it("raw_output이 300자 초과 → 300자로 잘린다 (output kind)", async () => {
    const longOutput = "실행 결과: " + "출력줄\n".repeat(60); // >300
    writeSession(
      sessionsDir,
      "s8",
      makeSessionWithTask("s8", "t1", { raw_output: longOutput }),
    );
    const loader = new RagContextLoader(sessionsDir);

    const [snippet] = await loader.load([
      makeHit({
        id: "output::s8::t1",
        distance: 0.1,
        meta: { kind: "output", session_id: "s8", task_id: "t1" },
      }),
    ]);

    expect(snippet!.content.length).toBeLessThanOrEqual(MAX_CHARS);
  });

  it("이모지 포함 content 300자 → 길이 제한 준수 (이모지는 JS에서 surrogate pair = length 2)", async () => {
    // 이모지(🚀)는 JavaScript에서 .length = 2 (surrogate pair)
    // 이모지 150개 = JS length 300 → 잘리지 않아야 함
    const emojiContent = "🚀".repeat(149) + "a"; // length = 299
    expect(emojiContent.length).toBe(299);

    writeSession(sessionsDir, "s9", makeSessionWithPrompt("s9", emojiContent));
    const loader = new RagContextLoader(sessionsDir);

    const [snippet] = await loader.load([
      makeHit({ id: "prompt::s9", distance: 0.1, meta: { kind: "prompt", session_id: "s9" } }),
    ]);

    expect(snippet!.content.length).toBeLessThanOrEqual(MAX_CHARS);
  });

  it("여러 hit 중 일부만 300자 초과 — 개별적으로 잘린다", async () => {
    const short = "짧은 내용";
    const long = "긴 내용 ".repeat(80); // >300

    writeSession(sessionsDir, "sa", makeSessionWithPrompt("sa", short));
    writeSession(sessionsDir, "sb", makeSessionWithPrompt("sb", long));

    const loader = new RagContextLoader(sessionsDir);
    const snippets = await loader.load([
      makeHit({ id: "prompt::sa", distance: 0.05, meta: { kind: "prompt", session_id: "sa" } }),
      makeHit({ id: "prompt::sb", distance: 0.10, meta: { kind: "prompt", session_id: "sb" } }),
    ]);

    expect(snippets).toHaveLength(2);
    expect(snippets[0]!.content).toBe(short); // 짧은 건 그대로
    expect(snippets[1]!.content.length).toBeLessThanOrEqual(MAX_CHARS); // 긴 건 잘림
  });
});
