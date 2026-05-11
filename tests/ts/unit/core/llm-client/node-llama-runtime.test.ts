import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

const nodeLlamaMocks = vi.hoisted(() => {
	const sessionSetChatHistory = vi.fn();
	const sessionPrompt = vi.fn(async () => "");
	const sessionCompletePrompt = vi.fn(async () => "Translated output");
	const sessionGenerateResponse = vi.fn(async () => ({
		response: "Translated output",
		fullResponse: ["Translated output"],
		lastEvaluation: {
			cleanHistory: [],
			contextWindow: [],
			contextShiftMetadata: null,
		},
		metadata: {
			stopReason: "maxTokens" as const,
		},
	}));
	const sessionDispose = vi.fn();
	const sessionResetChatHistory = vi.fn();
	const contextDispose = vi.fn(async () => {});
	const contextGetSequence = vi.fn(() => ({}));
	const modelCreateContext = vi.fn(async () => ({
		getSequence: contextGetSequence,
		dispose: contextDispose,
	}));
	const modelDispose = vi.fn(async () => {});
	const llamaDispose = vi.fn(async () => {});
	const loadModel = vi.fn(async () => ({
		createContext: modelCreateContext,
		dispose: modelDispose,
		fileInfo: {
			metadata: {
				general: {
					architecture: "qwen35",
				},
			},
		},
	}));
	const getLlama = vi.fn(async () => ({
		loadModel,
		dispose: llamaDispose,
	}));
	const LlamaChatSession = vi.fn(function (this: {
		setChatHistory: typeof sessionSetChatHistory;
		prompt: typeof sessionPrompt;
		completePrompt: typeof sessionCompletePrompt;
		_chat: { generateResponse: typeof sessionGenerateResponse };
		resetChatHistory: typeof sessionResetChatHistory;
		dispose: typeof sessionDispose;
	}) {
		this.setChatHistory = sessionSetChatHistory;
		this.prompt = sessionPrompt;
		this.completePrompt = sessionCompletePrompt;
		this._chat = {
			generateResponse: sessionGenerateResponse,
		};
		this.resetChatHistory = sessionResetChatHistory;
		this.dispose = sessionDispose;
	});

	return {
		LlamaChatSession,
		contextDispose,
		contextGetSequence,
		getLlama,
		llamaDispose,
		loadModel,
		modelCreateContext,
		modelDispose,
		sessionCompletePrompt,
		sessionGenerateResponse,
		sessionDispose,
		sessionResetChatHistory,
		sessionPrompt,
		sessionSetChatHistory,
	};
});

vi.mock("node-llama-cpp", () => ({
	getLlama: nodeLlamaMocks.getLlama,
	LlamaChatSession: nodeLlamaMocks.LlamaChatSession,
}));

import {
	completeChatWithNodeLlamaCpp,
	shutdownNodeLlamaCppRuntime,
} from "../../../../../src/core/llm-client/node-llama-runtime.js";

afterEach(async () => {
	await shutdownNodeLlamaCppRuntime();
	vi.restoreAllMocks();
	nodeLlamaMocks.LlamaChatSession.mockClear();
	nodeLlamaMocks.contextDispose.mockClear();
	nodeLlamaMocks.contextGetSequence.mockClear();
	nodeLlamaMocks.getLlama.mockClear();
	nodeLlamaMocks.llamaDispose.mockClear();
	nodeLlamaMocks.loadModel.mockClear();
	nodeLlamaMocks.modelCreateContext.mockClear();
	nodeLlamaMocks.modelDispose.mockClear();
	nodeLlamaMocks.sessionCompletePrompt.mockClear();
	nodeLlamaMocks.sessionGenerateResponse.mockClear();
	nodeLlamaMocks.sessionDispose.mockClear();
	nodeLlamaMocks.sessionResetChatHistory.mockClear();
	nodeLlamaMocks.sessionPrompt.mockClear();
	nodeLlamaMocks.sessionSetChatHistory.mockClear();
});

describe("completeChatWithNodeLlamaCpp", () => {
	it("reasoning 모델의 thought 구간이 있어도 completePrompt 경로로 응답을 유지한다", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "detoks-node-llama-"));
		const modelPath = join(tempDir, "test-model.gguf");
		writeFileSync(modelPath, "GGUFtest", "utf8");
		nodeLlamaMocks.loadModel.mockResolvedValueOnce({
			createContext: nodeLlamaMocks.modelCreateContext,
			dispose: nodeLlamaMocks.modelDispose,
			fileInfo: {
				metadata: {
					general: {
						architecture: "test-architecture",
					},
				},
			},
		});

		try {
			const response = await completeChatWithNodeLlamaCpp(
				{
					messages: [
						{
							role: "system",
							content: "Translate faithfully",
						},
						{
							role: "user",
							content: "새 파일을 생성해",
						},
					],
					max_tokens: 128,
				},
				{
					localLlmModelName: "test-model",
					localLlmModelPath: modelPath,
					localLlmContextSize: 4096,
					localLlmTopK: 40,
					localLlmTopP: 0.95,
					localLlmMaxTokens: 256,
				},
			);

			expect(nodeLlamaMocks.getLlama).toHaveBeenCalledOnce();
			expect(nodeLlamaMocks.loadModel).toHaveBeenCalledOnce();
			expect(nodeLlamaMocks.LlamaChatSession).toHaveBeenCalledOnce();
			expect(nodeLlamaMocks.sessionSetChatHistory).toHaveBeenCalledOnce();
			expect(nodeLlamaMocks.sessionSetChatHistory).toHaveBeenCalledWith([
				{
					type: "system",
					text: "Translate faithfully",
				},
			]);
			expect(nodeLlamaMocks.sessionCompletePrompt).toHaveBeenCalledOnce();
			expect(nodeLlamaMocks.sessionCompletePrompt).toHaveBeenCalledWith(
				"새 파일을 생성해",
				expect.objectContaining({
					maxTokens: 128,
					temperature: 0,
					topK: 40,
					topP: 0.95,
					trimWhitespaceSuffix: true,
				}),
			);
			expect(nodeLlamaMocks.sessionPrompt).not.toHaveBeenCalled();
			expect(response.content).toBe("Translated output");
			expect(response.raw_response).toMatchObject({
				choices: [
					{
						message: {
							content: "Translated output",
						},
					},
				],
			});
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("qwen3 계열은 generateResponse 경로로 응답을 유지한다", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "detoks-node-llama-"));
		const modelPath = join(tempDir, "test-model.gguf");
		writeFileSync(modelPath, "GGUFtest", "utf8");

		try {
			const response = await completeChatWithNodeLlamaCpp(
				{
					messages: [
						{
							role: "system",
							content: "Translate faithfully",
						},
						{
							role: "user",
							content: "새 파일을 생성해",
						},
					],
					max_tokens: 128,
				},
				{
					localLlmModelName: "Qwen3.5-4B-GGUF",
					localLlmModelPath: modelPath,
					localLlmContextSize: 4096,
					localLlmTopK: 40,
					localLlmTopP: 0.95,
					localLlmMaxTokens: 256,
				},
			);

			expect(nodeLlamaMocks.modelCreateContext).toHaveBeenCalledOnce();
			expect(nodeLlamaMocks.LlamaChatSession).toHaveBeenCalledOnce();
			expect(nodeLlamaMocks.sessionSetChatHistory).toHaveBeenCalledOnce();
			expect(nodeLlamaMocks.sessionGenerateResponse).toHaveBeenCalledOnce();
			expect(nodeLlamaMocks.sessionPrompt).not.toHaveBeenCalled();
			expect(nodeLlamaMocks.sessionCompletePrompt).not.toHaveBeenCalled();
			expect(response.content).toBe("Translated output");
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
