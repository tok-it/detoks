/**
 * hash.ts 경계 케이스 검증 데이터셋
 *
 * 기존 hash.test.ts에서 다루지 않는 경계 케이스:
 * - 대소문자 민감성
 * - 긴 입력 처리
 * - hashTaskInputV2 파라미터별 격리
 * - 빈 문자열 / 공백만 있는 입력
 */

import { describe, expect, it } from "vitest";
import {
  hashRawInput,
  hashRawInputScopedToProject,
  hashTaskInputV2,
} from "../../../../../src/core/rag/hash.js";

describe("hashRawInput — 경계 케이스", () => {
  it("대소문자 다름 → 다른 hash (SHA256은 대소문자 구분)", () => {
    expect(hashRawInput("Fix Bug")).not.toBe(hashRawInput("fix bug"));
    expect(hashRawInput("AUTH")).not.toBe(hashRawInput("auth"));
  });

  it("정규화 후 동일한 결과: 연속 탭+공백 혼합", () => {
    expect(hashRawInput("hello \t world")).toBe(hashRawInput("hello world"));
    expect(hashRawInput("a  \t  b  \n  c")).toBe(hashRawInput("a b c"));
  });

  it("빈 문자열 → 일관된 hash 반환 (crash 없음)", () => {
    const h = hashRawInput("");
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(hashRawInput("")).toBe(h);
  });

  it("공백만 있는 입력 → 빈 문자열과 같은 hash (trim 후 동일)", () => {
    expect(hashRawInput("   ")).toBe(hashRawInput(""));
    expect(hashRawInput("\n\t\n")).toBe(hashRawInput(""));
  });

  it("아주 긴 입력 (10,000자) — 일관된 16자 hash 반환", () => {
    const longInput = "가나다라마바사 ".repeat(1250); // ~10,000자
    const h = hashRawInput(longInput);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(hashRawInput(longInput)).toBe(h);
  });

  it("특수문자 포함 — 정상 hash 반환", () => {
    const special = "Fix: auth/token 검증 실패 <NULL> & 'undefined'";
    expect(hashRawInput(special)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("이모지 포함 — 안정적인 hash", () => {
    const withEmoji = "파일을 만들어줘 🚀";
    const h = hashRawInput(withEmoji);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(hashRawInput(withEmoji)).toBe(h);
  });

  it("줄바꿈 종류(\\r\\n vs \\n)가 달라도 정규화 후 같은 hash", () => {
    expect(hashRawInput("line1\r\nline2")).toBe(hashRawInput("line1\nline2"));
    expect(hashRawInput("line1\r\nline2")).toBe(hashRawInput("line1 line2"));
  });
});

describe("hashRawInputScopedToProject — 경계 케이스", () => {
  it("project_id가 빈 문자열이면 undefined와 동일하게 처리 — falsy 분기 타서 그대로 normalized만 사용", () => {
    // `""` 는 JS에서 falsy → composite 분기를 타지 않아 undefined와 같은 hash 반환
    const withUndefined = hashRawInputScopedToProject("hello", undefined);
    const withEmpty = hashRawInputScopedToProject("hello", "");
    expect(withEmpty).toBe(withUndefined);
  });

  it("project_id 앞뒤 공백이 있어도 해시에 그대로 반영된다 (trim 없음)", () => {
    // project_id는 정규화하지 않음 — 공백 포함 ID가 다른 hash를 낸다
    const a = hashRawInputScopedToProject("hello", "proj-a");
    const b = hashRawInputScopedToProject("hello", " proj-a");
    expect(a).not.toBe(b);
  });

  it("같은 텍스트라도 project_id가 달라서 생기는 격리는 결정적이다", () => {
    const ids = ["proj-a", "proj-b", "git-abc123", "path-xyz"];
    const hashes = ids.map((id) => hashRawInputScopedToProject("동일한 쿼리", id));
    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(ids.length); // 모두 달라야 함
  });
});

describe("hashTaskInputV2 — 파라미터별 격리", () => {
  const base = {
    projectId: "git-abc123",
    type: "explore",
    normalizedIntent: "auth 모듈 위치 탐색",
    adapter: "claude",
    adapterModel: "claude-opus-4-7",
    detoksMajorVersion: 1,
  };

  it("동일 파라미터 → 같은 hash", () => {
    expect(hashTaskInputV2(base)).toBe(hashTaskInputV2(base));
  });

  it("type만 다르면 → 다른 hash", () => {
    expect(hashTaskInputV2(base)).not.toBe(
      hashTaskInputV2({ ...base, type: "analyze" }),
    );
  });

  it("adapter만 다르면 → 다른 hash", () => {
    expect(hashTaskInputV2(base)).not.toBe(
      hashTaskInputV2({ ...base, adapter: "codex" }),
    );
  });

  it("adapterModel만 다르면 → 다른 hash", () => {
    expect(hashTaskInputV2(base)).not.toBe(
      hashTaskInputV2({ ...base, adapterModel: "claude-sonnet-4-6" }),
    );
  });

  it("normalizedIntent만 다르면 → 다른 hash", () => {
    expect(hashTaskInputV2(base)).not.toBe(
      hashTaskInputV2({ ...base, normalizedIntent: "다른 의도" }),
    );
  });

  it("detoksMajorVersion만 다르면 → 다른 hash", () => {
    expect(hashTaskInputV2(base)).not.toBe(
      hashTaskInputV2({ ...base, detoksMajorVersion: 2 }),
    );
  });

  it("projectId만 다르면 → 다른 hash (프로젝트 격리)", () => {
    expect(hashTaskInputV2(base)).not.toBe(
      hashTaskInputV2({ ...base, projectId: "git-xyz999" }),
    );
  });

  it("모든 파라미터 조합이 고유한 hash를 생성한다", () => {
    const variants = [
      base,
      { ...base, type: "analyze" },
      { ...base, adapter: "codex" },
      { ...base, adapterModel: "claude-sonnet-4-6" },
      { ...base, normalizedIntent: "다른 intent" },
      { ...base, detoksMajorVersion: 2 },
      { ...base, projectId: "git-zzz" },
    ];
    const hashes = variants.map(hashTaskInputV2);
    const unique = new Set(hashes);
    expect(unique.size).toBe(variants.length);
  });

  it("hash는 항상 16자 hex 문자열", () => {
    expect(hashTaskInputV2(base)).toMatch(/^[0-9a-f]{16}$/);
  });
});
