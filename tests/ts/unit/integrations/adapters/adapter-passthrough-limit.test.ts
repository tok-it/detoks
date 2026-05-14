import { describe, expect, it } from "vitest";
import type { AdapterExecutionRequest } from "../../../../../src/core/executor/types.js";
import { ClaudeStubAdapter } from "../../../../../src/integrations/adapters/claude/adapter.js";
import { CodexStubAdapter } from "../../../../../src/integrations/adapters/codex/adapter.js";
import { GeminiStubAdapter } from "../../../../../src/integrations/adapters/gemini/adapter.js";

const LIMIT = 200_000; // bytes

// 정확히 LIMIT 바이트인 ASCII 문자열 (1문자 = 1바이트)
const promptAtLimit = "a".repeat(LIMIT);
// LIMIT + 1 바이트 — 거부 경계
const promptOverLimit = "a".repeat(LIMIT + 1);
// 멀티바이트 문자(한글 1자 = 3바이트)로 LIMIT 초과
const promptMultibyte = "가".repeat(Math.ceil((LIMIT + 1) / 3));

describe("passthrough 모드 prompt 크기 제한 (200,000 bytes)", () => {
  const adapters = [
    { name: "claude", adapter: new ClaudeStubAdapter() },
    { name: "codex", adapter: new CodexStubAdapter() },
    { name: "gemini", adapter: new GeminiStubAdapter() },
  ] as const;

  for (const { name, adapter } of adapters) {
    describe(`${name} adapter`, () => {
      it("정확히 200,000 bytes는 통과", () => {
        expect(() =>
          adapter.buildSubprocessRequest({
            mode: "run",
            prompt: promptAtLimit,
            presentationMode: "passthrough",
            verbose: false,
          }),
        ).not.toThrow();
      });

      it("200,001 bytes에서 Error를 던진다", () => {
        expect(() =>
          adapter.buildSubprocessRequest({
            mode: "run",
            prompt: promptOverLimit,
            presentationMode: "passthrough",
            verbose: false,
          }),
        ).toThrow(/200,000 bytes/);
      });

      it("멀티바이트 문자로 200,000 bytes 초과 시 Error를 던진다", () => {
        expect(() =>
          adapter.buildSubprocessRequest({
            mode: "run",
            prompt: promptMultibyte,
            presentationMode: "passthrough",
            verbose: false,
          }),
        ).toThrow(/200,000 bytes/);
      });

      it("embedded-pane 모드에서는 크기 제한 없음", () => {
        expect(() =>
          adapter.buildSubprocessRequest({
            mode: "run",
            prompt: promptOverLimit,
            presentationMode: "embedded-pane",
            verbose: false,
          }),
        ).not.toThrow();
      });

      it("presentationMode 미지정(기본값)에서는 크기 제한 없음", () => {
        expect(() =>
          adapter.buildSubprocessRequest({
            mode: "run",
            prompt: promptOverLimit,
            verbose: false,
          }),
        ).not.toThrow();
      });

      it("prompt가 undefined이면 passthrough에서도 오류 없음", () => {
        const requestWithMissingPrompt = {
          mode: "run",
          prompt: undefined,
          presentationMode: "passthrough",
          verbose: false,
        } as unknown as AdapterExecutionRequest;

        expect(() =>
          adapter.buildSubprocessRequest(requestWithMissingPrompt),
        ).not.toThrow();
      });
    });
  }
});
