import { describe, expect, it } from "vitest";

/**
 * orchestrator.ts 모듈 상단에서 Budget Gate 상수를 초기화하는 패턴:
 *
 *   const COLD_START_THRESHOLD = Math.max(0, parseInt(env ?? "5", 10) || 5);
 *   const RAG_BREAK_EVEN_RATIO = parseFloat(env ?? "0.5") || 0.5;
 *   const PER_TASK_TOKEN_CAP   = Math.max(0, parseInt(env ?? "250", 10) || 250);
 *   const PER_SESSION_TOKEN_CAP= Math.max(0, parseInt(env ?? "500", 10) || 500);
 *   const MAX_PARALLEL_TASKS   = Math.max(1, parseInt(env ?? "5",   10) || 5);
 *
 * 이 테스트는 각 패턴이 NaN·빈 문자열·음수 등 잘못된 입력에서
 * 항상 안전한 기본값을 반환함을 명시적으로 고정한다.
 * 모듈 로드 타임에 평가되므로, 공식 자체를 단위 테스트로 커버한다.
 */

function parseIntWithFallback(raw: string | undefined, defaultVal: number): number {
  return parseInt(raw ?? String(defaultVal), 10) || defaultVal;
}

function parseFloatWithFallback(raw: string | undefined, defaultVal: number): number {
  return parseFloat(raw ?? String(defaultVal)) || defaultVal;
}

describe("Budget Gate env var NaN 방어 공식", () => {
  describe("parseInt || fallback 패턴 (COLD_START_THRESHOLD, PER_TASK_TOKEN_CAP, etc.)", () => {
    it.each([
      ["abc",   5],
      ["NaN",   5],
      ["",      5],
      [" ",     5],
      ["1.5",   1],  // parseInt truncates float → 1 (valid, truthy)
    ])("parseIntWithFallback(%j, 5) === %d", (input, expected) => {
      expect(parseIntWithFallback(input, 5)).toBe(expected);
    });

    it("유효한 정수는 그대로 사용", () => {
      expect(parseIntWithFallback("10", 5)).toBe(10);
      expect(parseIntWithFallback("250", 5)).toBe(250);
    });
  });

  describe("Math.max(0, ...) — 음수 방지 (PER_TASK_TOKEN_CAP, COLD_START_THRESHOLD)", () => {
    it("음수 env var는 Math.max(0, ...) 로 0으로 클램프", () => {
      // parseInt("-5") = -5, -5은 truthy이므로 || 250 적용 안 됨
      // Math.max(0, -5) = 0
      expect(Math.max(0, parseIntWithFallback("-5", 250))).toBe(0);
    });

    it("0은 falsy이므로 || fallback이 적용됨", () => {
      // parseInt("0") = 0 → falsy → || 250 적용 → 250
      expect(Math.max(0, parseIntWithFallback("0", 250))).toBe(250);
    });

    it("양수 유효값은 그대로 사용", () => {
      expect(Math.max(0, parseIntWithFallback("100", 250))).toBe(100);
    });
  });

  describe("Math.max(1, ...) — 최소 1 보장 (MAX_PARALLEL_TASKS)", () => {
    it("NaN 입력은 fallback 5, Math.max(1, 5) = 5", () => {
      expect(Math.max(1, parseIntWithFallback("abc", 5))).toBe(5);
    });

    it("0 입력은 || fallback 후 Math.max(1, 5) = 5", () => {
      expect(Math.max(1, parseIntWithFallback("0", 5))).toBe(5);
    });

    it("음수 입력은 Math.max(1, -3) = 1", () => {
      // parseInt("-3") = -3, truthy → || 5 미적용, Math.max(1, -3) = 1
      expect(Math.max(1, parseIntWithFallback("-3", 5))).toBe(1);
    });

    it("유효한 정수 3은 Math.max(1, 3) = 3", () => {
      expect(Math.max(1, parseIntWithFallback("3", 5))).toBe(3);
    });
  });

  describe("parseFloat || fallback 패턴 (RAG_BREAK_EVEN_RATIO)", () => {
    it.each([
      ["abc",  0.5],
      ["NaN",  0.5],
      ["",     0.5],
      ["0",    0.5],  // 0.0 is falsy → fallback
    ])("parseFloatWithFallback(%j, 0.5) === %d", (input, expected) => {
      expect(parseFloatWithFallback(input, 0.5)).toBe(expected);
    });

    it("유효한 소수는 그대로 사용", () => {
      expect(parseFloatWithFallback("0.3", 0.5)).toBe(0.3);
      expect(parseFloatWithFallback("1.0", 0.5)).toBe(1.0);
    });
  });
});
