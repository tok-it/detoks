import { afterEach, describe, expect, it, vi } from "vitest";

const nodeRuntimeMocks = vi.hoisted(() => ({
  completeChatWithNodeLlamaCpp: vi.fn(async () => ({
    content: "Create a new file",
    raw_response: {
      choices: [
        {
          message: {
            content: "Create a new file",
          },
        },
      ],
    },
    inference_time_sec: 0.01,
  })),
}));

vi.mock(
  "../../../../../src/core/llm-client/node-llama-runtime.js",
  () => nodeRuntimeMocks,
);

import { complete_chat } from "../../../../../src/core/llm-client/client.js";

afterEach(() => {
  nodeRuntimeMocks.completeChatWithNodeLlamaCpp.mockClear();
});

describe("complete_chat", () => {
  it("필수 모델명이 없으면 오류를 반환한다", async () => {
    await expect(() =>
      complete_chat(
        {
          messages: [
            {
              role: "user",
              content: "파일 생성",
            },
          ],
        },
        {},
      ),
    ).rejects.toThrow("LLM client requires LOCAL_LLM_MODEL_NAME");
  });

  it("HTTP 호출 없이 node-llama-cpp runtime으로 위임한다", async () => {
    const fetchImplementation = vi.fn(async () => {
      throw new Error("fetch should not be called");
    });

    const response = await complete_chat(
      {
        messages: [
          {
            role: "system",
            content: "Translate faithfully",
          },
          {
            role: "user",
            content: "파일 생성",
          },
        ],
        max_tokens: 128,
      },
      {
        localLlmRuntimeProvider: "node-llama-cpp",
        localLlmModelName: "local-model",
        localLlmModelDir: "/models",
        localLlmHfFile: "local-model.gguf",
        localLlmContextSize: 4096,
        localLlmTopK: 40,
        localLlmTopP: 0.95,
        localLlmMaxTokens: 512,
        fetchImplementation,
      },
    );

    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(nodeRuntimeMocks.completeChatWithNodeLlamaCpp).toHaveBeenCalledOnce();
    expect(nodeRuntimeMocks.completeChatWithNodeLlamaCpp).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 128,
      }),
      expect.objectContaining({
        localLlmModelName: "local-model",
        localLlmModelDir: "/models",
        localLlmHfFile: "local-model.gguf",
      }),
    );
    expect(response.content).toBe("Create a new file");
  });
});
