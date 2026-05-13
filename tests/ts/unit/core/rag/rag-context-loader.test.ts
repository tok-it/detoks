import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RagContextLoader, formatRagSnippetsForPrompt } from "../../../../../src/core/rag/rag-context-loader.js";
import type { SearchResult } from "../../../../../src/core/rag/vector-store.js";

function makeHit(overrides: Partial<SearchResult> & { meta: SearchResult["meta"] }): SearchResult {
  return { id: "default-id", distance: 0.1, ...overrides };
}

function writeSession(dir: string, sessionId: string, data: object) {
  writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify(data));
}

function makeSessionData(opts: {
  sessionId: string;
  rawInput?: string;
  tasks?: Record<string, { summary?: string; raw_output?: string }>;
}) {
  return {
    shared_context: { session_id: opts.sessionId, raw_input: opts.rawInput ?? "" },
    task_results: opts.tasks ?? {},
    completed_task_ids: Object.keys(opts.tasks ?? {}),
    current_task_id: null,
    updated_at: new Date().toISOString(),
  };
}

describe("RagContextLoader", () => {
  let sessionsDir: string;

  beforeEach(() => {
    sessionsDir = mkdtempSync(join(tmpdir(), "detoks-rag-ctx-"));
  });

  afterEach(() => {
    rmSync(sessionsDir, { recursive: true, force: true });
  });

  it("prompt hit — raw_input을 content로 로딩한다", async () => {
    writeSession(sessionsDir, "s1", makeSessionData({ sessionId: "s1", rawInput: "Find the auth module" }));
    const loader = new RagContextLoader(sessionsDir);
    const hit = makeHit({ id: "prompt::s1", distance: 0.05, meta: { kind: "prompt", session_id: "s1" } });

    const snippets = await loader.load([hit]);

    expect(snippets).toHaveLength(1);
    expect(snippets[0]!.kind).toBe("prompt");
    expect(snippets[0]!.content).toContain("Find the auth module");
    expect(snippets[0]!.distance).toBe(0.05);
    expect(snippets[0]!.session_id).toBe("s1");
  });

  it("task hit — summary를 content로 로딩한다", async () => {
    writeSession(
      sessionsDir,
      "s2",
      makeSessionData({
        sessionId: "s2",
        tasks: { t1: { summary: "Found auth.ts with verifyToken", raw_output: "long output..." } },
      }),
    );
    const loader = new RagContextLoader(sessionsDir);
    const hit = makeHit({ id: "task::s2::t1", distance: 0.1, meta: { kind: "task", session_id: "s2", task_id: "t1" } });

    const snippets = await loader.load([hit]);

    expect(snippets[0]!.kind).toBe("task");
    expect(snippets[0]!.content).toContain("Found auth.ts");
    expect(snippets[0]!.task_id).toBe("t1");
  });

  it("task hit — summary 없으면 raw_output fallback", async () => {
    writeSession(
      sessionsDir,
      "s3",
      makeSessionData({ sessionId: "s3", tasks: { t1: { raw_output: "fallback output" } } }),
    );
    const loader = new RagContextLoader(sessionsDir);
    const hit = makeHit({ id: "task::s3::t1", distance: 0.2, meta: { kind: "task", session_id: "s3", task_id: "t1" } });

    const snippets = await loader.load([hit]);

    expect(snippets[0]!.content).toContain("fallback output");
  });

  it("output hit — raw_output을 content로 로딩한다", async () => {
    writeSession(
      sessionsDir,
      "s4",
      makeSessionData({ sessionId: "s4", tasks: { t2: { raw_output: "actual raw output text" } } }),
    );
    const loader = new RagContextLoader(sessionsDir);
    const hit = makeHit({ id: "output::s4::t2", distance: 0.15, meta: { kind: "output", session_id: "s4", task_id: "t2" } });

    const snippets = await loader.load([hit]);

    expect(snippets[0]!.kind).toBe("output");
    expect(snippets[0]!.content).toContain("actual raw output text");
  });

  it("content가 300자를 넘으면 잘라낸다", async () => {
    const longText = "a".repeat(500);
    writeSession(sessionsDir, "s5", makeSessionData({ sessionId: "s5", rawInput: longText }));
    const loader = new RagContextLoader(sessionsDir);
    const hit = makeHit({ id: "prompt::s5", distance: 0.1, meta: { kind: "prompt", session_id: "s5" } });

    const snippets = await loader.load([hit]);

    expect(snippets[0]!.content.length).toBeLessThanOrEqual(300);
  });

  it("세션 파일이 없으면 해당 hit을 건너뛴다", async () => {
    const loader = new RagContextLoader(sessionsDir);
    const hit = makeHit({ id: "prompt::nonexistent", distance: 0.1, meta: { kind: "prompt", session_id: "nonexistent" } });

    const snippets = await loader.load([hit]);

    expect(snippets).toHaveLength(0);
  });

  it("빈 hits → 빈 배열 반환", async () => {
    const loader = new RagContextLoader(sessionsDir);
    expect(await loader.load([])).toHaveLength(0);
  });

  it("여러 hit을 순서 보존하며 로딩한다", async () => {
    writeSession(sessionsDir, "sa", makeSessionData({ sessionId: "sa", rawInput: "first prompt" }));
    writeSession(sessionsDir, "sb", makeSessionData({ sessionId: "sb", rawInput: "second prompt" }));
    const loader = new RagContextLoader(sessionsDir);
    const hits = [
      makeHit({ id: "prompt::sa", distance: 0.05, meta: { kind: "prompt", session_id: "sa" } }),
      makeHit({ id: "prompt::sb", distance: 0.12, meta: { kind: "prompt", session_id: "sb" } }),
    ];

    const snippets = await loader.load(hits);

    expect(snippets).toHaveLength(2);
    expect(snippets[0]!.session_id).toBe("sa");
    expect(snippets[1]!.session_id).toBe("sb");
  });
});

describe("formatRagSnippetsForPrompt", () => {
  it("빈 배열이면 빈 문자열을 반환한다", () => {
    expect(formatRagSnippetsForPrompt([])).toBe("");
  });

  it("스니펫을 포맷된 헤더+본문으로 변환한다", () => {
    const snippets = [
      { id: "task::s1::t1", kind: "task" as const, session_id: "s1", task_id: "t1", content: "Found auth.ts", distance: 0.1 },
      { id: "prompt::s2", kind: "prompt" as const, session_id: "s2", content: "Find auth module", distance: 0.2 },
    ];
    const result = formatRagSnippetsForPrompt(snippets);

    expect(result).toContain("Found auth.ts");
    expect(result).toContain("Find auth module");
    expect(result).toContain("[task]");
    expect(result).toContain("[prompt]");
  });
});
