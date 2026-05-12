import { describe, expect, it } from "vitest";
import {
  hashRawInput,
  hashRawInputScopedToProject,
  computeProjectId,
} from "../../../../../src/core/rag/hash.js";

describe("hashRawInput", () => {
  it("같은 입력은 같은 hash 반환", () => {
    expect(hashRawInput("hello world")).toBe(hashRawInput("hello world"));
  });

  it("공백·줄바꿈 정규화로 의미 동일 입력은 같은 hash", () => {
    expect(hashRawInput("hello   world")).toBe(hashRawInput("hello world"));
    expect(hashRawInput("  hello world  ")).toBe(hashRawInput("hello world"));
    expect(hashRawInput("hello\nworld")).toBe(hashRawInput("hello world"));
    expect(hashRawInput("hello\tworld")).toBe(hashRawInput("hello world"));
  });

  it("다른 입력은 다른 hash", () => {
    expect(hashRawInput("hello")).not.toBe(hashRawInput("world"));
  });

  it("16자 hex 문자열 반환", () => {
    const hash = hashRawInput("test prompt");
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("한국어 입력도 안정적인 hash", () => {
    const a = hashRawInput("파일을 새로 만들어줘");
    const b = hashRawInput("파일을 새로 만들어줘");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("hashRawInputScopedToProject", () => {
  it("같은 입력 + 같은 프로젝트 = 같은 hash", () => {
    expect(hashRawInputScopedToProject("hello", "proj-a")).toBe(
      hashRawInputScopedToProject("hello", "proj-a"),
    );
  });

  it("같은 입력 + 다른 프로젝트 = 다른 hash", () => {
    expect(hashRawInputScopedToProject("hello", "proj-a")).not.toBe(
      hashRawInputScopedToProject("hello", "proj-b"),
    );
  });

  it("project_id 없을 때 = hashRawInput과 같음", () => {
    expect(hashRawInputScopedToProject("hello", undefined)).toBe(
      hashRawInput("hello"),
    );
  });
});

describe("computeProjectId", () => {
  it("결정적: 같은 cwd로 두 번 호출하면 같은 ID", () => {
    const cwd = process.cwd();
    expect(computeProjectId(cwd)).toBe(computeProjectId(cwd));
  });

  it("git 저장소면 git- 접두어 반환", () => {
    const id = computeProjectId(process.cwd());
    expect(id).toMatch(/^(git-|git-local-|path-)/);
  });

  it("git 없는 경로는 path- 접두어 fallback", () => {
    const id = computeProjectId("/tmp");
    expect(id).toMatch(/^(git-|git-local-|path-)/);
  });

  it("다른 경로는 다른 ID", () => {
    const a = computeProjectId("/tmp/aaaaa");
    const b = computeProjectId("/tmp/bbbbb");
    expect(a).not.toBe(b);
  });
});
