import { describe, expect, it, vi } from "vitest";

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

describe("complete_chat", () => {
  it("local LLM의 OpenAI-compatible chat completions 응답을 파싱한다", async () => {
    const fetchImplementation = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "Create a new file",
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    const response = await complete_chat(
      {
        messages: [
          {
            role: "user",
            content: "파일 생성",
          },
        ],
        max_tokens: 128,
      },
      {
        apiBase: "http://127.0.0.1:1234/v1",
        apiKey: "test-key",
        localLlmModelName: "local-model",
        fetchImplementation,
      },
    );

    expect(fetchImplementation).toHaveBeenCalledOnce();
    const mockCalls = fetchImplementation.mock.calls as unknown as Array<
      [string | URL | Request, RequestInit?]
    >;
    expect(mockCalls[0]?.[0]).toBe(
      "http://127.0.0.1:1234/v1/chat/completions",
    );
    expect(JSON.parse(String(mockCalls[0]?.[1]?.body))).toMatchObject({
      max_tokens: 128,
    });
    expect(response.content).toBe("Create a new file");
    expect(response.raw_response).toBeTruthy();
    expect(response.inference_time_sec).toBeTypeOf("number");
  });

  it("필수 설정이 없으면 오류를 반환한다", async () => {
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
        {
          localLlmModelName: "local-model",
        },
      ),
    ).rejects.toThrow("LLM client requires LOCAL_LLM_API_BASE");
  });

  it("fetch가 응답 객체를 반환하지 않으면 명시적 오류를 반환한다", async () => {
    const fetchImplementation = vi.fn(async () => undefined as never);

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
        {
          apiBase: "http://127.0.0.1:1234/v1",
          apiKey: "test-key",
          localLlmModelName: "local-model",
          fetchImplementation,
        },
      ),
    ).rejects.toThrow("Invalid LLM response: fetch returned no response");
  });

  it("node-llama-cpp provider면 HTTP 없이 in-process runtime으로 위임한다", async () => {
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
