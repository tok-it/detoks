import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

	const nodeLlamaMocks = vi.hoisted(() => {
		const sessionSetChatHistory = vi.fn();
		const sessionPrompt = vi.fn(async () => "");
		const sessionCompletePrompt = vi.fn(async () => "Translated output");
		const sessionPromptWithMeta = vi.fn(async () => ({
			responseText: "Translated output",
			response: ["Translated output"],
			stopReason: "maxTokens" as const,
			remainingGenerationAfterStop: undefined,
		}));
		const sessionDispose = vi.fn();
		const sessionResetChatHistory = vi.fn();
		const QwenChatWrapper = vi.fn();
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
			promptWithMeta: typeof sessionPromptWithMeta;
			resetChatHistory: typeof sessionResetChatHistory;
			dispose: typeof sessionDispose;
		}) {
			this.setChatHistory = sessionSetChatHistory;
			this.prompt = sessionPrompt;
			this.completePrompt = sessionCompletePrompt;
			this.promptWithMeta = sessionPromptWithMeta;
			this.resetChatHistory = sessionResetChatHistory;
			this.dispose = sessionDispose;
		});

		return {
			LlamaChatSession,
			QwenChatWrapper,
			contextDispose,
			contextGetSequence,
			getLlama,
		llamaDispose,
			loadModel,
			modelCreateContext,
			modelDispose,
			sessionCompletePrompt,
			sessionDispose,
			sessionPromptWithMeta,
			sessionResetChatHistory,
			sessionPrompt,
			sessionSetChatHistory,
	};
});

	vi.mock("node-llama-cpp", () => ({
		getLlama: nodeLlamaMocks.getLlama,
		LlamaChatSession: nodeLlamaMocks.LlamaChatSession,
		QwenChatWrapper: nodeLlamaMocks.QwenChatWrapper,
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
		nodeLlamaMocks.QwenChatWrapper.mockClear();
		nodeLlamaMocks.sessionCompletePrompt.mockClear();
		nodeLlamaMocks.sessionDispose.mockClear();
		nodeLlamaMocks.sessionPromptWithMeta.mockClear();
		nodeLlamaMocks.sessionResetChatHistory.mockClear();
		nodeLlamaMocks.sessionPrompt.mockClear();
		nodeLlamaMocks.sessionSetChatHistory.mockClear();
});

	describe("completeChatWithNodeLlamaCpp", () => {
		it("같은 런타임에서는 컨텍스트와 세션을 재사용한다", async () => {
			const tempDir = mkdtempSync(join(tmpdir(), "detoks-node-llama-"));
			const modelPath = join(tempDir, "test-model.gguf");
			writeFileSync(modelPath, "GGUFtest", "utf8");

			try {
				const request = {
					messages: [
						{
							role: "system" as const,
							content: "Translate faithfully",
						},
						{
							role: "user" as const,
							content: "새 파일을 생성해",
						},
					],
					max_tokens: 128,
				};
				const config = {
					localLlmModelName: "Qwen3.5-4B-GGUF",
					localLlmModelPath: modelPath,
					localLlmContextSize: 4096,
					localLlmTopK: 40,
					localLlmTopP: 0.95,
					localLlmMaxTokens: 256,
					localLlmReasoning: "off",
				};

				await completeChatWithNodeLlamaCpp(request, config);
				await completeChatWithNodeLlamaCpp(request, config);

				expect(nodeLlamaMocks.getLlama).toHaveBeenCalledOnce();
				expect(nodeLlamaMocks.loadModel).toHaveBeenCalledOnce();
				expect(nodeLlamaMocks.modelCreateContext).toHaveBeenCalledOnce();
				expect(nodeLlamaMocks.LlamaChatSession).toHaveBeenCalledOnce();
				expect(nodeLlamaMocks.sessionSetChatHistory).toHaveBeenCalledTimes(2);
				expect(nodeLlamaMocks.sessionPromptWithMeta).toHaveBeenCalledTimes(2);
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});

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
					localLlmReasoning: "off",
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

		it("qwen3 계열은 Qwen wrapper + promptWithMeta 경로로 응답을 유지한다", async () => {
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
					localLlmReasoning: "off",
				},
				);

				expect(nodeLlamaMocks.modelCreateContext).toHaveBeenCalledOnce();
				expect(nodeLlamaMocks.LlamaChatSession).toHaveBeenCalledOnce();
				expect(nodeLlamaMocks.QwenChatWrapper).toHaveBeenCalledWith({
					variation: "3.5",
					thoughts: "discourage",
				});
				expect(nodeLlamaMocks.sessionSetChatHistory).toHaveBeenCalledOnce();
				expect(nodeLlamaMocks.sessionPromptWithMeta).toHaveBeenCalledOnce();
				expect(nodeLlamaMocks.sessionPromptWithMeta).toHaveBeenCalledWith(
					"새 파일을 생성해",
					expect.objectContaining({
						budgets: {
							thoughtTokens: 0,
						},
						maxTokens: 1024,
						temperature: 0,
						topK: 40,
						topP: 0.95,
						trimWhitespaceSuffix: true,
					}),
				);
				expect(nodeLlamaMocks.sessionPrompt).not.toHaveBeenCalled();
				expect(nodeLlamaMocks.sessionCompletePrompt).not.toHaveBeenCalled();
				expect(response.content).toBe("Translated output");
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it("reasoning이 off가 아니면 thought budget을 강제로 0으로 두지 않는다", async () => {
			const tempDir = mkdtempSync(join(tmpdir(), "detoks-node-llama-"));
			const modelPath = join(tempDir, "test-model.gguf");
			writeFileSync(modelPath, "GGUFtest", "utf8");

			try {
				await completeChatWithNodeLlamaCpp(
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
						localLlmReasoning: "on",
					},
				);

				expect(nodeLlamaMocks.QwenChatWrapper).toHaveBeenCalledWith({
					variation: "3.5",
					thoughts: "auto",
				});
				expect(nodeLlamaMocks.sessionPromptWithMeta).toHaveBeenCalledWith(
					"새 파일을 생성해",
					expect.not.objectContaining({
						budgets: expect.anything(),
					}),
				);
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});
	});
