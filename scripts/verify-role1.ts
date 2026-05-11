#!/usr/bin/env tsx

import {
	createWriteStream,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { get_encoding } from "tiktoken";
import {
	type BatchProgressInfo,
	runBatchPromptPipeline,
} from "../src/core/pipeline/batch.js";
import { shutdownManagedLocalLlmRuntime } from "../src/core/llm-client/local-runtime.js";
import {
	assertValidGgufModelFile,
	resolveConfiguredRole1ModelPath,
} from "../src/core/llm-client/gguf-file.js";
import {
	loadRole1Policies,
	loadRole1RuntimeConfig,
} from "../src/core/prompt/config.js";
import { mask_protected_segments } from "../src/core/translate/masking.js";

type RuntimeProvider = "llama-server" | "node-llama-cpp";

interface VerifyOptions {
	prompt?: string;
	filePath: string;
	limit?: number;
	index?: number;
	outputPath?: string;
	runtimeProvider?: RuntimeProvider;
	debug: boolean;
}

interface BatchInput {
	data: string[];
}

type Role1ModelPreparationConfig = Pick<
	ReturnType<typeof loadRole1RuntimeConfig>,
	| "localLlmModelPath"
	| "localLlmModelDir"
	| "localLlmModelUrl"
	| "localLlmHfRepo"
	| "localLlmHfFile"
	| "localLlmRuntimeProvider"
>;

interface VerificationItem {
	index: number;
	raw_input: string;
	ph_masked_input: string;
	normalized_input: string;
	compiled_prompt: string;
	role2_handoff: string;
	language: "ko" | "en" | "mixed";
	status: "completed" | "failed";
	inference_time_sec: number;
	input_prompt_tokens: number;
	normalized_input_tokens: number;
	compiled_prompt_tokens: number;
	token_reduction_rate: number | null;
	translation_token_reduction_rate: number | null;
	compression_token_reduction_rate: number | null;
	validation_errors: string[];
	repair_actions: string[];
	error?: string;
	debug?: {
		masked_text: string;
		placeholders: Array<{
			placeholder: string;
			original: string;
			kind: string;
		}>;
		spans: Array<{
			kind: string;
			text: string;
			translate: boolean;
		}>;
		fallback_span_count: number;
	};
}

interface VerificationSummary {
	completed_count: number;
	failed_count: number;
	average_inference_time_sec: number;
	average_token_reduction_rate: number;
	average_translation_token_reduction_rate: number;
	average_compression_token_reduction_rate: number;
	compression_fallback_count: number;
	repair_action_item_count: number;
	validation_failed_count: number;
}

function getUsage(): string {
	return [
		"Usage:",
		'  npm run verify:role1 -- --prompt "새 파일을 생성해"',
		'  npm run verify:role1 -- --prompt "새 파일을 생성해" --runtime-provider node-llama-cpp',
		"  npm run verify:role1 -- --file tests/data/row_data.json --limit 5",
		"  npm run verify:role1 -- --file tests/data/row_data.json --index 12 --debug --output tmp/role1-result.json",
		"",
		"Options:",
		"  --prompt <text>    단일 프롬프트 수동 검증",
		"  --file <path>      입력 JSON 파일 경로 (기본: tests/data/row_data.json)",
		"  --limit <n>        앞에서부터 n개만 실행",
		"  --index <n>        0-based 특정 인덱스 1개만 실행",
		"  --output <path>    결과 JSON 저장 경로",
		"  --runtime-provider <llama-server|node-llama-cpp>  Role 1 로컬 LLM 런타임 강제 지정",
		"  --debug            PIPELINE_MODE=debug로 실행",
		"  --help             도움말 출력",
	].join("\n");
}

export function parseArgs(argv: string[]): VerifyOptions {
	let prompt: string | undefined;
	let filePath = "tests/data/row_data.json";
	let limit: number | undefined;
	let index: number | undefined;
	let outputPath: string | undefined;
	let runtimeProvider: RuntimeProvider | undefined;
	let debug = false;

	for (let i = 0; i < argv.length; i += 1) {
		const current = argv[i];
		if (!current) {
			continue;
		}

		if (current === "--help" || current === "-h") {
			console.log(getUsage());
			process.exit(0);
		}

		if (current === "--debug") {
			debug = true;
			continue;
		}

		if (current === "--prompt") {
			prompt = argv[i + 1];
			i += 1;
			continue;
		}

		if (current === "--file") {
			filePath = argv[i + 1] ?? filePath;
			i += 1;
			continue;
		}

		if (current === "--limit") {
			limit = Number(argv[i + 1]);
			i += 1;
			continue;
		}

		if (current === "--index") {
			index = Number(argv[i + 1]);
			i += 1;
			continue;
		}

		if (current === "--output") {
			outputPath = argv[i + 1];
			i += 1;
			continue;
		}

		if (current === "--runtime-provider") {
			const value = argv[i + 1];
			if (value !== "llama-server" && value !== "node-llama-cpp") {
				throw new Error(
					"--runtime-provider must be one of: llama-server, node-llama-cpp",
				);
			}
			runtimeProvider = value;
			i += 1;
			continue;
		}

		if (!current.startsWith("--") && !prompt) {
			prompt = current;
			continue;
		}

		throw new Error(`Unknown argument: ${current}`);
	}

	if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
		throw new Error("--limit must be a positive integer");
	}

	if (index !== undefined && (!Number.isInteger(index) || index < 0)) {
		throw new Error("--index must be a non-negative integer");
	}

	const parsed: VerifyOptions = {
		filePath,
		debug,
	};

	if (prompt !== undefined) {
		parsed.prompt = prompt;
	}
	if (limit !== undefined) {
		parsed.limit = limit;
	}
	if (index !== undefined) {
		parsed.index = index;
	}
	if (outputPath !== undefined) {
		parsed.outputPath = outputPath;
	}
	if (runtimeProvider !== undefined) {
		parsed.runtimeProvider = runtimeProvider;
	}

	return parsed;
}

export function buildScriptEnv(
	options: Pick<VerifyOptions, "debug" | "runtimeProvider">,
): NodeJS.ProcessEnv {
	return {
		...process.env,
		...(options.debug ? { PIPELINE_MODE: "debug" } : {}),
		...(options.runtimeProvider
			? { LOCAL_LLM_RUNTIME_PROVIDER: options.runtimeProvider }
			: {}),
	};
}

function loadInputs(options: VerifyOptions): string[] {
	if (options.prompt) {
		return [options.prompt];
	}

	const absolutePath = resolve(process.cwd(), options.filePath);
	const parsed = JSON.parse(readFileSync(absolutePath, "utf8")) as BatchInput;

	if (!Array.isArray(parsed.data)) {
		throw new Error(`Invalid input file shape: ${absolutePath}`);
	}

	let rows = parsed.data;

	if (options.index !== undefined) {
		const item = rows[options.index];
		if (item === undefined) {
			throw new Error(`Index out of range: ${options.index}`);
		}
		rows = [item];
	} else if (options.limit !== undefined) {
		rows = rows.slice(0, options.limit);
	}

	return rows;
}

function maskApiKey(value: string | undefined): string {
	if (!value) {
		return "(not set)";
	}

	if (value.length <= 6) {
		return "***";
	}

	return `${value.slice(0, 3)}***${value.slice(-2)}`;
}

function roundMetric(value: number): number {
	return Number(value.toFixed(3));
}

function encodeTokenCount(
	encoding: ReturnType<typeof get_encoding>,
	text: string,
): number {
	return encoding.encode(text).length;
}

function calculateTokenReductionRate(
	inputPromptTokens: number,
	compiledPromptTokens: number,
): number | null {
	if (inputPromptTokens <= 0 || compiledPromptTokens <= 0) {
		return null;
	}

	return roundMetric(
		((inputPromptTokens - compiledPromptTokens) / inputPromptTokens) * 100,
	);
}

function resolveRuntimeApiBaseLabel(
	runtimeProvider: RuntimeProvider | undefined,
	apiBase: string | undefined,
): string {
	if (runtimeProvider === "node-llama-cpp") {
		return "(unused: in-process runtime)";
	}

	return apiBase ?? "(not set)";
}

export function renderBatchProgressMessage(progress: BatchProgressInfo): string {
	if (progress.phase === "start") {
		return `(${progress.current}/${progress.total}) Processing ${progress.summary}...`;
	}

	const inferenceMs = Math.round(
		(progress.result?.inference_time_sec ?? 0) * 1000,
	);
	if (progress.result?.status === "completed" && !progress.result.error) {
		return `  inference : ${inferenceMs}ms`;
	}

	const parts = [
		`  status : ${progress.result?.status ?? "failed"}`,
		`inference : ${inferenceMs}ms`,
	];
	if (progress.result?.error) {
		parts.push(`error : ${progress.result.error}`);
	} else if ((progress.result?.validation_errors.length ?? 0) > 0) {
		parts.push(
			`validation_errors : ${progress.result?.validation_errors.length ?? 0}`,
		);
	}

	return parts.join(" | ");
}

function buildRole1ModelDownloadUrl(
	config: Pick<
		Role1ModelPreparationConfig,
		"localLlmModelUrl" | "localLlmHfRepo" | "localLlmHfFile"
	>,
): string {
	if (config.localLlmModelUrl) {
		return config.localLlmModelUrl;
	}

	const { localLlmHfRepo, localLlmHfFile } = config;
	if (!localLlmHfRepo || !localLlmHfFile) {
		throw new Error(
			"Role 1 모델 다운로드 정보를 찾을 수 없습니다. LOCAL_LLM_MODEL_URL 또는 LOCAL_LLM_HF_REPO / LOCAL_LLM_HF_FILE을 설정하세요.",
		);
	}

	return `https://huggingface.co/${localLlmHfRepo}/resolve/main/${localLlmHfFile}`;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes}B`;
	}

	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)}KB`;
	}

	if (bytes < 1024 * 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
	}

	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

function renderDownloadProgress(
	downloadedBytes: number,
	totalBytes: number,
): string {
	if (totalBytes > 0) {
		const safeDownloadedBytes = Math.min(downloadedBytes, totalBytes);
		const percent = ((safeDownloadedBytes / totalBytes) * 100).toFixed(1);
		return `${percent}% (${formatBytes(safeDownloadedBytes)} / ${formatBytes(totalBytes)})`;
	}

	return `${formatBytes(downloadedBytes)} 다운로드됨`;
}

async function downloadRole1Model(
	url: string,
	modelPath: string,
): Promise<void> {
	mkdirSync(dirname(modelPath), { recursive: true });

	const tempPath = `${modelPath}.download`;
	const response = await fetch(url);

	if (!response.ok || !response.body) {
		throw new Error(
			`모델 다운로드 실패: ${response.status} ${response.statusText}`,
		);
	}

	const totalBytes = Number(response.headers.get("content-length") ?? 0);
	let downloadedBytes = 0;
	let nextProgressLogAt = 0;

	process.stdout.write(
		`모델 다운로드 중: ${modelPath}${totalBytes > 0 ? ` (${formatBytes(totalBytes)})` : ""}\n`,
	);

	try {
		const progressStream = new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				downloadedBytes += chunk.byteLength;
				const now = Date.now();

				if (now >= nextProgressLogAt || downloadedBytes === totalBytes) {
					process.stdout.write(
						`\r  진행률: ${renderDownloadProgress(downloadedBytes, totalBytes)}`,
					);
					nextProgressLogAt = now + 1_000;
				}

				controller.enqueue(chunk);
			},
		});

		await pipeline(
			Readable.fromWeb(response.body.pipeThrough(progressStream)),
			createWriteStream(tempPath, { flags: "w" }),
		);
		process.stdout.write("\n");
		renameSync(tempPath, modelPath);
		process.stdout.write(`모델 다운로드 완료: ${modelPath}\n`);
	} catch (error) {
		rmSync(tempPath, { force: true });
		throw error;
	}
}

export async function ensureRole1ModelFile(
	config: Role1ModelPreparationConfig,
	scriptEnv: NodeJS.ProcessEnv,
): Promise<string> {
	const modelPath = resolveConfiguredRole1ModelPath(config);

	if (!modelPath) {
		throw new Error(
			"Role 1 모델 경로를 찾을 수 없습니다. LOCAL_LLM_MODEL_PATH 또는 LOCAL_LLM_MODEL_DIR / LOCAL_LLM_HF_FILE을 설정하세요.",
		);
	}

	if (scriptEnv.LOCAL_LLM_RUNTIME_PROVIDER === undefined) {
		scriptEnv.LOCAL_LLM_RUNTIME_PROVIDER =
			config.localLlmRuntimeProvider ?? "llama-server";
	}

	scriptEnv.LOCAL_LLM_MODEL_PATH = modelPath;

	if (existsSync(modelPath)) {
		assertValidGgufModelFile(modelPath);
		return modelPath;
	}

	const modelUrl = buildRole1ModelDownloadUrl(config);
	await downloadRole1Model(modelUrl, modelPath);
	assertValidGgufModelFile(modelPath);
	return modelPath;
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const scriptEnv = buildScriptEnv(options);
	const runtimeConfig = loadRole1RuntimeConfig({ env: scriptEnv });
	await ensureRole1ModelFile(runtimeConfig, scriptEnv);
	const policies = loadRole1Policies();
	const inputs = loadInputs(options);

	try {
		console.log(
			JSON.stringify(
				{
					ok: true,
					mode: "role1-verify",
					runtime_provider:
						runtimeConfig.localLlmRuntimeProvider ?? "(not set)",
					model: runtimeConfig.localLlmModelName ?? "(not set)",
					api_base: resolveRuntimeApiBaseLabel(
						runtimeConfig.localLlmRuntimeProvider,
						runtimeConfig.localLlmApiBase,
					),
					api_key: maskApiKey(runtimeConfig.localLlmApiKey),
					pipeline_mode: options.debug ? "debug" : runtimeConfig.pipelineMode,
					input_count: inputs.length,
				},
				null,
				2,
			),
		);

			const batchResult = await runBatchPromptPipeline(inputs, {
				env: scriptEnv,
				onProgress: (progress) => {
					process.stdout.write(`${renderBatchProgressMessage(progress)}\n`);
				},
			});
		const encoding = get_encoding("o200k_base");

		try {
			const results: VerificationItem[] = batchResult.results.map(
				(item, index) => {
					const inputPromptTokens = encodeTokenCount(encoding, item.raw_input);
					const phMaskedInput = mask_protected_segments(item.raw_input, {
						protected_terms: policies.protectedTerms,
						preferred_translations: policies.preferredTranslations,
						model_names: runtimeConfig.localLlmModelName
							? [runtimeConfig.localLlmModelName]
							: [],
					}).masked_text;
					const normalizedInput = item.normalized_input ?? "";
					const normalizedInputTokens = encodeTokenCount(
						encoding,
						normalizedInput,
					);
					const compiledPrompt = item.compiled_prompt ?? "";
					const compiledPromptTokens = encodeTokenCount(
						encoding,
						compiledPrompt,
					);

					return {
						index: options.index !== undefined ? options.index : index,
						raw_input: item.raw_input,
						ph_masked_input: phMaskedInput,
						normalized_input: normalizedInput,
						compiled_prompt: compiledPrompt,
						role2_handoff: item.role2_handoff ?? "",
						language: item.language ?? "en",
						status: item.status,
						inference_time_sec: item.inference_time_sec ?? 0,
						input_prompt_tokens: inputPromptTokens,
						normalized_input_tokens: normalizedInputTokens,
						compiled_prompt_tokens: compiledPromptTokens,
						token_reduction_rate: calculateTokenReductionRate(
							inputPromptTokens,
							compiledPromptTokens,
						),
						translation_token_reduction_rate: calculateTokenReductionRate(
							inputPromptTokens,
							normalizedInputTokens,
						),
						compression_token_reduction_rate: calculateTokenReductionRate(
							normalizedInputTokens,
							compiledPromptTokens,
						),
						validation_errors: item.validation_errors,
						repair_actions: item.repair_actions,
						...(item.error ? { error: item.error } : {}),
						...(item.debug ? { debug: item.debug } : {}),
					};
				},
			);

			for (const item of results) {
				console.log(
					JSON.stringify(
						{
							index: item.index,
							status: item.status,
							language: item.language,
							raw_input: item.raw_input,
							ph_masked_input: item.ph_masked_input,
							normalized_input: item.normalized_input,
							compiled_prompt: item.compiled_prompt,
							role2_handoff: item.role2_handoff,
							inference_time_sec: item.inference_time_sec,
							input_prompt_tokens: item.input_prompt_tokens,
							normalized_input_tokens: item.normalized_input_tokens,
							compiled_prompt_tokens: item.compiled_prompt_tokens,
							token_reduction_rate: item.token_reduction_rate,
							translation_token_reduction_rate:
								item.translation_token_reduction_rate,
							compression_token_reduction_rate:
								item.compression_token_reduction_rate,
							validation_errors: item.validation_errors,
							repair_actions: item.repair_actions,
							...(item.error ? { error: item.error } : {}),
							...(options.debug && item.debug
								? {
										debug: {
											masked_text: item.debug.masked_text,
											placeholder_count: item.debug.placeholders.length,
											span_count: item.debug.spans.length,
											fallback_span_count: item.debug.fallback_span_count,
										},
									}
								: {}),
						},
						null,
						2,
					),
				);
			}

			const completedCount = results.filter(
				(item) => item.status === "completed",
			).length;
			const failedCount = results.length - completedCount;
			const inferenceSamples = results
				.map((item) => item.inference_time_sec)
				.filter((value) => value > 0);
			const reductionSamples = results
				.map((item) => item.token_reduction_rate)
				.filter((value): value is number => value !== null);
			const translationReductionSamples = results
				.map((item) => item.translation_token_reduction_rate)
				.filter((value): value is number => value !== null);
			const compressionReductionSamples = results
				.map((item) => item.compression_token_reduction_rate)
				.filter((value): value is number => value !== null);
			const summary: VerificationSummary = {
				completed_count: completedCount,
				failed_count: failedCount,
				average_inference_time_sec:
					inferenceSamples.length > 0
						? roundMetric(
								inferenceSamples.reduce((sum, value) => sum + value, 0) /
									inferenceSamples.length,
							)
						: 0,
				average_token_reduction_rate:
					reductionSamples.length > 0
						? roundMetric(
								reductionSamples.reduce((sum, value) => sum + value, 0) /
									reductionSamples.length,
							)
						: 0,
				average_translation_token_reduction_rate:
					translationReductionSamples.length > 0
						? roundMetric(
								translationReductionSamples.reduce(
									(sum, value) => sum + value,
									0,
								) / translationReductionSamples.length,
							)
						: 0,
				average_compression_token_reduction_rate:
					compressionReductionSamples.length > 0
						? roundMetric(
								compressionReductionSamples.reduce(
									(sum, value) => sum + value,
									0,
								) / compressionReductionSamples.length,
							)
						: 0,
				compression_fallback_count: results.filter((item) =>
					item.repair_actions.includes(
						"compression_fallback_to_normalized_input",
					),
				).length,
				repair_action_item_count: results.filter(
					(item) => item.repair_actions.length > 0,
				).length,
				validation_failed_count: results.filter(
					(item) => item.validation_errors.length > 0,
				).length,
			};

			console.log(
				JSON.stringify(
					{
						ok: failedCount === 0,
						mode: "role1-verify-summary",
						...summary,
					},
					null,
					2,
				),
			);

			if (options.outputPath) {
				const absoluteOutputPath = isAbsolute(options.outputPath)
					? options.outputPath
					: join(process.cwd(), options.outputPath);
				mkdirSync(dirname(absoluteOutputPath), { recursive: true });
				writeFileSync(
					absoluteOutputPath,
					JSON.stringify(
						{
							summary,
							run_metadata: batchResult.run_metadata,
							results,
						},
						null,
						2,
					),
					"utf8",
				);

				console.log(
					JSON.stringify(
						{
							ok: true,
							output: absoluteOutputPath,
						},
						null,
						2,
					),
				);
			}
		} finally {
			encoding.free();
		}
	} finally {
		await shutdownManagedLocalLlmRuntime();
	}
}

function isMainModule(): boolean {
	const entryPath = process.argv[1];
	return (
		entryPath !== undefined &&
		resolve(entryPath) === fileURLToPath(import.meta.url)
	);
}

if (isMainModule()) {
	main().catch((error) => {
		const message = error instanceof Error ? error.message : String(error);
		console.error(JSON.stringify({ ok: false, error: message }, null, 2));
		process.exitCode = 1;
	});
}
