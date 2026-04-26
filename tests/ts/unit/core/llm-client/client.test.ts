import { describe, expect, it, vi } from "vitest";
import { complete_chat } from "../../../../../src/core/llm-client/client.js";

describe("complete_chat", () => {
  it("OpenAI-compatible chat completions 응답을 파싱한다", async () => {
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
      },
      {
        apiBase: "http://127.0.0.1:1234/v1",
        apiKey: "test-key",
        modelName: "local-model",
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
          modelName: "local-model",
        },
      ),
    ).rejects.toThrow("LLM client requires OPENAI_API_BASE");
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
          modelName: "local-model",
          fetchImplementation,
        },
      ),
    ).rejects.toThrow("Invalid LLM response: fetch returned no response");
  });
});
