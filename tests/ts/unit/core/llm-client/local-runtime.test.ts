import { afterEach, describe, expect, it, vi } from "vitest";

const nodeRuntimeMocks = vi.hoisted(() => ({
	buildNodeLlamaRuntimeSignature: vi.fn(() => "node-runtime-signature"),
	ensureNodeLlamaCppRuntime: vi.fn(async () => {}),
	shutdownNodeLlamaCppRuntime: vi.fn(async () => true),
}));

vi.mock(
	"../../../../../src/core/llm-client/node-llama-runtime.js",
	() => nodeRuntimeMocks,
);

import {
	getActiveLocalLlmRuntimeProvider,
	ensureLocalLlmRuntime,
	shutdownManagedLocalLlmRuntime,
} from "../../../../../src/core/llm-client/local-runtime.js";

afterEach(async () => {
	await shutdownManagedLocalLlmRuntime();
	vi.restoreAllMocks();
	nodeRuntimeMocks.buildNodeLlamaRuntimeSignature.mockClear();
	nodeRuntimeMocks.ensureNodeLlamaCppRuntime.mockClear();
	nodeRuntimeMocks.shutdownNodeLlamaCppRuntime.mockClear();
});

describe("node-llama-cpp local runtime", () => {
	it("provider가 없어도 node-llama-cpp runtime 초기화를 호출한다", async () => {
		await expect(
			ensureLocalLlmRuntime({
				localLlmApiBase: "http://127.0.0.1:12472/v1",
				localLlmModelName: "detoks-local",
				localLlmAutoStart: true,
				localLlmModelDir: "/Users/test/.detoks/models",
				localLlmHfFile: "detoks.gguf",
				localLlmGpuLayers: "0",
				localLlmDevice: "none",
				localLlmContextSize: 4096,
				localLlmTopK: 40,
				localLlmTopP: 0.95,
				localLlmMaxTokens: 512,
				pipelineMode: "safe",
				requestTimeout: 30000,
				translationMaxAttempts: 5,
				temperature: 0,
			}),
		).resolves.toBeUndefined();

		expect(
			nodeRuntimeMocks.buildNodeLlamaRuntimeSignature,
		).toHaveBeenCalledOnce();
		expect(nodeRuntimeMocks.ensureNodeLlamaCppRuntime).toHaveBeenCalledOnce();
		expect(getActiveLocalLlmRuntimeProvider()).toBe("node-llama-cpp");
	});

	it("같은 signature의 중복 ensure는 이미 활성화된 runtime을 재사용한다", async () => {
		const config = {
			localLlmModelName: "detoks-local",
			localLlmRuntimeProvider: "node-llama-cpp" as const,
			localLlmAutoStart: true,
			localLlmModelDir: "/Users/test/.detoks/models",
			localLlmHfFile: "detoks.gguf",
			localLlmGpuLayers: "0",
			localLlmDevice: "none",
			localLlmContextSize: 4096,
			localLlmTopK: 40,
			localLlmTopP: 0.95,
			localLlmMaxTokens: 512,
			pipelineMode: "safe" as const,
			requestTimeout: 30000,
			translationMaxAttempts: 5,
			temperature: 0,
		};

		await ensureLocalLlmRuntime(config);
		await ensureLocalLlmRuntime(config);

		expect(nodeRuntimeMocks.ensureNodeLlamaCppRuntime).toHaveBeenCalledOnce();
	});

	it("node-llama-cpp provider 종료는 in-process runtime 정리로 위임한다", async () => {
		await ensureLocalLlmRuntime({
			localLlmModelName: "detoks-local",
			localLlmRuntimeProvider: "node-llama-cpp",
			localLlmAutoStart: true,
			localLlmModelDir: "/Users/test/.detoks/models",
			localLlmHfFile: "detoks.gguf",
			localLlmGpuLayers: "0",
			localLlmDevice: "none",
			localLlmContextSize: 4096,
			localLlmTopK: 40,
			localLlmTopP: 0.95,
			localLlmMaxTokens: 512,
			pipelineMode: "safe",
			requestTimeout: 30000,
			translationMaxAttempts: 5,
			temperature: 0,
		});

		await expect(shutdownManagedLocalLlmRuntime()).resolves.toBe(true);
		expect(nodeRuntimeMocks.shutdownNodeLlamaCppRuntime).toHaveBeenCalledOnce();
		expect(getActiveLocalLlmRuntimeProvider()).toBeNull();
	});

	it("node-llama-cpp startup 실패는 그대로 전파된다", async () => {
		nodeRuntimeMocks.ensureNodeLlamaCppRuntime.mockRejectedValueOnce(
			new Error("unknown model architecture: 'gemma4'"),
		);

		await expect(
			ensureLocalLlmRuntime({
				localLlmModelName: "detoks-local",
				localLlmRuntimeProvider: "node-llama-cpp",
				localLlmAutoStart: true,
				localLlmModelDir: "/Users/test/.detoks/models",
				localLlmHfFile: "detoks.gguf",
				localLlmGpuLayers: "0",
				localLlmDevice: "none",
				localLlmContextSize: 4096,
				localLlmTopK: 40,
				localLlmTopP: 0.95,
				localLlmMaxTokens: 512,
				pipelineMode: "safe",
				requestTimeout: 30000,
				translationMaxAttempts: 5,
				temperature: 0,
			}),
		).rejects.toThrow("unknown model architecture: 'gemma4'");

		expect(getActiveLocalLlmRuntimeProvider()).toBeNull();
	});
});
