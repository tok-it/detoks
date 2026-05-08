import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	buildLlamaServerArgs,
	buildNodeLlamaSidecarSpawnSpec,
	getBinaryProbeCommand,
	ensureLocalLlmRuntime,
	shutdownManagedLocalLlmRuntime,
} from "../../../../../src/core/llm-client/local-runtime.js";

afterEach(async () => {
	await shutdownManagedLocalLlmRuntime();
	delete process.env.DETOKS_NODE_LLAMA_SIDECAR_ENTRY;
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("buildLlamaServerArgs", () => {
	it("플랫폼에 맞는 바이너리 탐색 명령을 고른다", () => {
		expect(getBinaryProbeCommand("win32")).toBe("where");
		expect(getBinaryProbeCommand("linux")).toBe("which");
		expect(getBinaryProbeCommand("darwin")).toBe("which");
	});

	it("GGUF 경로가 있으면 해당 파일을 모델로 로드한다", () => {
		const args = buildLlamaServerArgs({
			localLlmModelPath: "/models/detoks.gguf",
			localLlmModelName: "detoks-local",
			localLlmServerHost: "127.0.0.1",
			localLlmServerPort: 12370,
			localLlmGpuLayers: "all",
			localLlmContextSize: 4096,
			localLlmTopK: 40,
			localLlmTopP: 0.95,
			localLlmSleepIdleSeconds: 1200,
			localLlmReasoning: "off",
			pipelineMode: "safe",
			requestTimeout: 30000,
			translationMaxAttempts: 5,
			temperature: 0,
		});

		expect(args).toEqual([
			"-m",
			"/models/detoks.gguf",
			"--alias",
			"detoks-local",
			"--host",
			"127.0.0.1",
			"--port",
			"12370",
			"--gpu-layers",
			"all",
			"--ctx-size",
			"4096",
			"--top-k",
			"40",
			"--top-p",
			"0.95",
			"--reasoning",
			"off",
			"--sleep-idle-seconds",
			"1200",
		]);
	});

	it("GGUF 경로가 없으면 Hugging Face GGUF repo를 llama-server 다운로드 대상으로 넘긴다", () => {
		const args = buildLlamaServerArgs({
			localLlmHfRepo: "mradermacher/gemma-4-e2b-it-heretic-ara-GGUF:Q4_K_S",
			localLlmHfFile: "gemma-4-e2b-it-heretic-ara.Q4_K_S.gguf",
			localLlmModelName: "detoks-local",
			localLlmServerHost: "127.0.0.1",
			localLlmServerPort: 12370,
			localLlmGpuLayers: "all",
			localLlmContextSize: 4096,
			localLlmTopK: 40,
			localLlmTopP: 0.95,
			localLlmSleepIdleSeconds: 1200,
			localLlmReasoning: "off",
			pipelineMode: "safe",
			requestTimeout: 30000,
			translationMaxAttempts: 5,
			temperature: 0,
		});

		expect(args).toEqual([
			"-hf",
			"mradermacher/gemma-4-e2b-it-heretic-ara-GGUF:Q4_K_S",
			"--hf-file",
			"gemma-4-e2b-it-heretic-ara.Q4_K_S.gguf",
			"--alias",
			"detoks-local",
			"--host",
			"127.0.0.1",
			"--port",
			"12370",
			"--gpu-layers",
			"all",
			"--ctx-size",
			"4096",
			"--top-k",
			"40",
			"--top-p",
			"0.95",
			"--reasoning",
			"off",
			"--sleep-idle-seconds",
			"1200",
		]);
	});

	it("device가 지정되면 llama.cpp device 인자를 추가한다", () => {
		const args = buildLlamaServerArgs({
			localLlmHfRepo: "mradermacher/gemma-4-e2b-it-heretic-ara-GGUF:Q4_K_S",
			localLlmHfFile: "gemma-4-e2b-it-heretic-ara.Q4_K_S.gguf",
			localLlmModelName: "detoks-local",
			localLlmServerHost: "127.0.0.1",
			localLlmServerPort: 12370,
			localLlmGpuLayers: "0",
			localLlmDevice: "none",
			localLlmContextSize: 4096,
			localLlmTopK: 40,
			localLlmTopP: 0.95,
			localLlmSleepIdleSeconds: 1200,
			pipelineMode: "safe",
			requestTimeout: 30000,
			translationMaxAttempts: 5,
			temperature: 0,
		});

		expect(args).toContain("--device");
		expect(args).toContain("none");
		expect(args).toContain("--gpu-layers");
		expect(args).toContain("0");
	});

	it("node-llama-cpp sidecar 기동 스펙에 현재 런타임 설정을 싣는다", () => {
		const scriptDir = mkdtempSync(join(tmpdir(), "detoks-node-sidecar-spec-"));
		const sidecarPath = join(scriptDir, "fake-sidecar.mjs");
		writeFileSync(sidecarPath, "process.exit(0);\n", "utf8");
		process.env.DETOKS_NODE_LLAMA_SIDECAR_ENTRY = sidecarPath;

		try {
			const spec = buildNodeLlamaSidecarSpawnSpec({
				localLlmApiBase: "http://127.0.0.1:12370/v1",
				localLlmModelName: "detoks-local",
				localLlmRuntimeProvider: "node-llama-cpp",
				localLlmAutoStart: true,
				localLlmServerHost: "127.0.0.1",
				localLlmServerPort: 12370,
				localLlmModelDir: "/Users/test/.detoks/models",
				localLlmHfFile: "detoks.gguf",
				localLlmGpuLayers: "all",
				localLlmContextSize: 4096,
				localLlmTopK: 40,
				localLlmTopP: 0.95,
				localLlmMaxTokens: 512,
				pipelineMode: "safe",
				requestTimeout: 30000,
				translationMaxAttempts: 5,
				temperature: 0,
			});

			expect(spec.command).toBe(process.execPath);
			expect(spec.args).toEqual([sidecarPath]);
			expect(spec.env?.DETOKS_NODE_LLAMA_CONFIG).toContain(
				'"modelName":"detoks-local"',
			);
			expect(spec.env?.DETOKS_NODE_LLAMA_CONFIG).toContain(
				'"modelDir":"/Users/test/.detoks/models"',
			);
		} finally {
			rmSync(scriptDir, { recursive: true, force: true });
		}
	});

	it("이미 떠 있는 서버가 현재 모델과 같으면 그대로 재사용한다", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce({
				ok: true,
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					data: [
						{
							id: "mradermacher/gemma-4-e2b-it-heretic-ara-GGUF:Q4_K_S",
							aliases: [
								"mradermacher/gemma-4-e2b-it-heretic-ara-GGUF:Q4_K_S",
							],
						},
					],
				}),
			} as Response);

		vi.stubGlobal("fetch", fetchMock);

		await expect(
			ensureLocalLlmRuntime({
				localLlmApiBase: "http://127.0.0.1:12370/v1",
				localLlmModelName:
					"mradermacher/gemma-4-e2b-it-heretic-ara-GGUF:Q4_K_S",
				localLlmRuntimeProvider: "llama-server",
				localLlmAutoStart: true,
				localLlmServerHost: "127.0.0.1",
				localLlmServerPort: 12370,
				localLlmGpuLayers: "all",
				localLlmContextSize: 4096,
				localLlmTopK: 41,
				localLlmTopP: 0.95,
				localLlmSleepIdleSeconds: 1200,
				localLlmReasoning: "off",
				pipelineMode: "safe",
				requestTimeout: 30000,
				translationMaxAttempts: 5,
				temperature: 0,
			}),
		).resolves.toBeUndefined();
	});

	it("llama-server 바이너리가 없으면 친절한 오류를 던진다", async () => {
		const scriptDir = mkdtempSync(join(tmpdir(), "detoks-which-"));
		const originalPath = process.env.PATH ?? "";
		writeFileSync(
			join(scriptDir, "which"),
			[
				"#!/bin/sh",
				"exit 1",
			].join("\n"),
			"utf8",
		);
		chmodSync(join(scriptDir, "which"), 0o755);
		process.env.PATH = `${scriptDir}:${originalPath}`;

		try {
			await expect(
				ensureLocalLlmRuntime({
					localLlmApiBase: "http://127.0.0.1:12370/v1",
					localLlmModelName:
						"mradermacher/gemma-4-e2b-it-heretic-ara-GGUF:Q4_K_S",
					localLlmRuntimeProvider: "llama-server",
					localLlmAutoStart: true,
					localLlmServerBinary: "llama-server",
					localLlmServerHost: "127.0.0.1",
					localLlmServerPort: 12370,
					localLlmGpuLayers: "all",
					localLlmContextSize: 4096,
					localLlmTopK: 40,
					localLlmTopP: 0.95,
					localLlmSleepIdleSeconds: 1200,
					localLlmReasoning: "off",
					pipelineMode: "safe",
					requestTimeout: 30000,
					translationMaxAttempts: 5,
					temperature: 0,
				}),
			).rejects.toThrow(
				"로컬 llama.cpp 서버 바이너리를 찾을 수 없습니다: llama-server",
			);
		} finally {
			process.env.PATH = originalPath;
			rmSync(scriptDir, { recursive: true, force: true });
		}
	});

	it("빈 GGUF 파일이면 자동 삭제/재다운로드 없이 즉시 실패한다", async () => {
		const scriptDir = mkdtempSync(join(tmpdir(), "detoks-gguf-"));
		const originalPath = process.env.PATH ?? "";
		const modelPath = join(scriptDir, "broken.gguf");
		writeFileSync(
			join(scriptDir, "llama-server"),
			[
				"#!/bin/sh",
				"exit 0",
			].join("\n"),
			"utf8",
		);
		writeFileSync(modelPath, "", "utf8");
		chmodSync(join(scriptDir, "llama-server"), 0o755);
		process.env.PATH = `${scriptDir}:${originalPath}`;
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValue({ ok: false } as Response);
		vi.stubGlobal("fetch", fetchMock);

		try {
			await expect(
				ensureLocalLlmRuntime({
					localLlmApiBase: "http://127.0.0.1:12370/v1",
					localLlmModelName: "broken-model",
					localLlmModelPath: modelPath,
					localLlmRuntimeProvider: "llama-server",
					localLlmAutoStart: true,
					localLlmServerBinary: "llama-server",
					localLlmServerHost: "127.0.0.1",
					localLlmServerPort: 12370,
					localLlmGpuLayers: "all",
					localLlmContextSize: 4096,
					localLlmTopK: 40,
					localLlmTopP: 0.95,
					localLlmSleepIdleSeconds: 1200,
					localLlmReasoning: "off",
					pipelineMode: "safe",
					requestTimeout: 30000,
					translationMaxAttempts: 5,
					temperature: 0,
				}),
			).rejects.toThrow("로컬 GGUF 모델 파일이 비어 있습니다");
		} finally {
			process.env.PATH = originalPath;
			rmSync(scriptDir, { recursive: true, force: true });
		}
	});

	it("모델이 바뀌면 기존 서버를 종료하고 새 모델로 다시 띄운다", async () => {
		const scriptDir = mkdtempSync(join(tmpdir(), "detoks-llama-"));
		const originalPath = process.env.PATH ?? "";
		writeFileSync(
			join(scriptDir, "pgrep"),
			[
				"#!/bin/sh",
				"echo '22222 /usr/local/bin/llama-server --host 127.0.0.1 --port 12370 --alias old-model'",
			].join("\n"),
			"utf8",
		);
		writeFileSync(
			join(scriptDir, "llama-server"),
			[
				"#!/bin/sh",
				"trap 'exit 0' TERM INT",
				"sleep 1",
			].join("\n"),
			"utf8",
		);
		chmodSync(join(scriptDir, "pgrep"), 0o755);
		chmodSync(join(scriptDir, "llama-server"), 0o755);
		process.env.PATH = `${scriptDir}:${originalPath}`;
		const killedPids = new Set<number>();
		const killSpy = vi.spyOn(process, "kill").mockImplementation(
			((pid: number, signal?: NodeJS.Signals | number) => {
				if (signal === 0) {
					if (killedPids.has(pid)) {
						throw new Error("ESRCH");
					}

					return true;
				}

				killedPids.add(pid);
				return true;
			}) as typeof process.kill,
		);
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce({
				ok: true,
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					data: [
						{
							id: "old-model",
							aliases: ["old-model"],
						},
					],
				}),
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					data: [
						{
							id: "mradermacher/gemma-4-e2b-it-heretic-ara-GGUF:Q4_K_S",
							aliases: [
								"mradermacher/gemma-4-e2b-it-heretic-ara-GGUF:Q4_K_S",
							],
						},
					],
				}),
			} as Response);

		vi.stubGlobal("fetch", fetchMock);

		try {
			await expect(
				ensureLocalLlmRuntime({
					localLlmApiBase: "http://127.0.0.1:12370/v1",
					localLlmModelName:
						"mradermacher/gemma-4-e2b-it-heretic-ara-GGUF:Q4_K_S",
					localLlmRuntimeProvider: "llama-server",
					localLlmAutoStart: true,
					localLlmServerBinary: "llama-server",
					localLlmServerHost: "127.0.0.1",
					localLlmServerPort: 12370,
					localLlmGpuLayers: "all",
					localLlmContextSize: 4096,
					localLlmTopK: 40,
					localLlmTopP: 0.95,
					localLlmSleepIdleSeconds: 1200,
					localLlmReasoning: "off",
					pipelineMode: "safe",
					requestTimeout: 30000,
					translationMaxAttempts: 5,
					temperature: 0,
				}),
			).resolves.toBeUndefined();

			expect(killSpy).toHaveBeenCalledWith(22222, "SIGTERM");
		} finally {
			process.env.PATH = originalPath;
			rmSync(scriptDir, { recursive: true, force: true });
		}
	});

	it("직접 띄운 llama-server는 명시적으로 종료할 수 있다", async () => {
		const scriptDir = mkdtempSync(join(tmpdir(), "detoks-llama-stop-"));
		const originalPath = process.env.PATH ?? "";
		writeFileSync(
			join(scriptDir, "llama-server"),
			[
				"#!/bin/sh",
				"trap 'exit 0' TERM INT",
				"sleep 30",
			].join("\n"),
			"utf8",
		);
		chmodSync(join(scriptDir, "llama-server"), 0o755);
		process.env.PATH = `${scriptDir}:${originalPath}`;

		const killSignals = new Map<number, Array<NodeJS.Signals | number | undefined>>();
		const killSpy = vi.spyOn(process, "kill").mockImplementation(
			((pid: number, signal?: NodeJS.Signals | number) => {
				const history = killSignals.get(pid) ?? [];
				history.push(signal);
				killSignals.set(pid, history);

				if (signal === 0) {
					if (history.includes("SIGTERM") || history.includes("SIGKILL")) {
						throw new Error("ESRCH");
					}

					return true;
				}

				return true;
			}) as typeof process.kill,
		);
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce({
				ok: false,
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					data: [
						{
							id: "detoks-local",
							aliases: ["detoks-local"],
						},
					],
				}),
			} as Response);

		vi.stubGlobal("fetch", fetchMock);

		try {
			await ensureLocalLlmRuntime({
				localLlmApiBase: "http://127.0.0.1:12370/v1",
				localLlmModelName: "detoks-local",
				localLlmRuntimeProvider: "llama-server",
				localLlmAutoStart: true,
				localLlmServerBinary: "llama-server",
				localLlmServerHost: "127.0.0.1",
				localLlmServerPort: 12370,
				localLlmGpuLayers: "0",
				localLlmDevice: "none",
				localLlmContextSize: 4096,
				localLlmTopK: 40,
				localLlmTopP: 0.95,
				localLlmSleepIdleSeconds: 1200,
				localLlmReasoning: "off",
				localLlmHfRepo: "repo/model",
				localLlmHfFile: "model.gguf",
				pipelineMode: "safe",
				requestTimeout: 30000,
				translationMaxAttempts: 5,
				temperature: 0,
			});

			await expect(shutdownManagedLocalLlmRuntime()).resolves.toBe(true);
			expect(killSpy).toHaveBeenCalledWith(expect.any(Number), "SIGTERM");
		} finally {
			process.env.PATH = originalPath;
			rmSync(scriptDir, { recursive: true, force: true });
		}
	});

	it("node-llama-cpp provider는 sidecar를 기동하고 종료할 수 있다", async () => {
		const scriptDir = mkdtempSync(join(tmpdir(), "detoks-node-sidecar-"));
		const sidecarPath = join(scriptDir, "fake-sidecar.mjs");
		writeFileSync(
			sidecarPath,
			[
				'import { createServer } from "node:http";',
				'const config = JSON.parse(process.env.DETOKS_NODE_LLAMA_CONFIG ?? "{}");',
				'const host = config.host ?? "127.0.0.1";',
				"const port = Number(config.port ?? 12472);",
				'const model = config.modelName ?? "detoks-local";',
				"const server = createServer((req, res) => {",
				'  if (req.url === "/health") {',
				'    res.writeHead(200, {"content-type": "application/json"});',
				'    res.end(JSON.stringify({status: "ok"}));',
				"    return;",
				"  }",
				'  if (req.url === "/v1/models") {',
				'    res.writeHead(200, {"content-type": "application/json"});',
				'    res.end(JSON.stringify({data: [{id: model, aliases: [model]}]}));',
				"    return;",
				"  }",
				"  res.writeHead(404);",
				"  res.end();",
				"});",
				"server.listen(port, host);",
				'process.on("SIGTERM", () => server.close(() => process.exit(0)));',
				'process.on("SIGINT", () => server.close(() => process.exit(0)));',
			].join("\n"),
			"utf8",
		);
		process.env.DETOKS_NODE_LLAMA_SIDECAR_ENTRY = sidecarPath;

		try {
			await expect(
				ensureLocalLlmRuntime({
					localLlmApiBase: "http://127.0.0.1:12472/v1",
					localLlmModelName: "detoks-local",
					localLlmRuntimeProvider: "node-llama-cpp",
					localLlmAutoStart: true,
					localLlmServerHost: "127.0.0.1",
					localLlmServerPort: 12472,
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

			const healthResponse = await fetch("http://127.0.0.1:12472/health");
			expect(healthResponse.ok).toBe(true);
			await expect(shutdownManagedLocalLlmRuntime()).resolves.toBe(true);
		} finally {
			rmSync(scriptDir, { recursive: true, force: true });
		}
	});
});
