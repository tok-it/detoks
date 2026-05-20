#!/usr/bin/env tsx

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { get_encoding } from "tiktoken";
import { shutdownManagedLocalLlmRuntime } from "../src/core/llm-client/local-runtime.js";
import { EmbeddingService } from "../src/core/rag/embedding-service.js";
import {
	loadRole1Policies,
	loadRole1RuntimeConfig,
} from "../src/core/prompt/config.js";
import {
	translate_to_english,
	type TranslateToEnglishResult,
} from "../src/core/translate/translate.js";
import { getDetoksModelFilePath } from "../src/core/model-store.js";
import { KURE_EMBEDDING_MODEL } from "../src/cli/model-setup/models.js";

type JsonObject = Record<string, unknown>;

const DEFAULT_EMBEDDING_MODEL_FILE = "KURE-v1-Q4_K_M.gguf";

const getDefaultEmbeddingModelPath = (): string =>
	process.env.RAG_EMBEDDING_MODEL_PATH?.trim() ||
	getDetoksModelFilePath(KURE_EMBEDDING_MODEL);

interface BenchmarkArgs {
	modelsPath?: string;
	filePath: string;
	referenceFilePath?: string;
	limit?: number;
	index?: number;
	debug: boolean;
	benchmarkOutputDir: string;
	reportOutputPath: string;
	fromJsonPaths: string[];
	title: string;
	embeddingModelPath: string;
}

export interface ModelSpec {
	name: string;
	env: Record<string, string>;
}

interface InputRecord {
	index: number;
	raw_input: string;
}

interface ReferenceRecord {
	index: number;
	reference: string;
}

export interface TranslateBenchmarkItem {
	index: number;
	raw_input: string;
	translated_text: string;
	status: "completed" | "failed";
	inference_time_sec: number;
	input_tokens: number;
	output_tokens: number;
	validation_errors: string[];
	repair_actions: string[];
	fallback_span_count: number;
	korean_remaining: boolean;
	reference?: string;
	reference_similarity?: number;
	reference_pass?: boolean;
	error?: string;
}

export interface TranslateBenchmarkSummary {
	model_name: string;
	input_count: number;
	completed_count: number;
	failed_count: number;
	success_rate: number;
	average_inference_time_sec: number;
	average_output_tokens: number;
	average_reference_similarity?: number;
	validation_failed_count: number;
	korean_remaining_count: number;
	fallback_span_count: number;
}

export interface TranslateBenchmarkFile {
	summary: TranslateBenchmarkSummary;
	run_metadata: {
		generated_at: string;
		mode: "translate-only";
		model_name: string;
		source_file?: string;
		input_count: number;
	};
	results: TranslateBenchmarkItem[];
}

export interface ReportModelData {
	modelName: string;
	sourcePath: string;
	summary: TranslateBenchmarkSummary;
	results: TranslateBenchmarkItem[];
}

function getUsage(): string {
	return [
		"Usage:",
		"  npm run benchmark:translate-report -- [--models models.json] [--file tests/data/row_data.json] [--reference-file refs.json]",
		"  npm run benchmark:translate-report -- --from-json tmp/model-a.json --from-json tmp/model-b.json",
		"",
		"Options:",
		"  --models <path>                 모델 목록 JSON",
		"  --file <path>                   입력 JSON 파일 경로 (기본: tests/data/row_data.json)",
		"  --reference-file <path>         정답 번역 JSON 파일 경로",
		"  --limit <n>                     앞에서부터 n개만 실행",
		"  --index <n>                     0-based 특정 인덱스 1개만 실행",
		"  --debug                         PIPELINE_MODE=debug로 실행",
		"  --benchmark-output-dir <dir>    벤치마크 JSON 저장 디렉터리",
		"  --report-output <path>          Markdown 보고서 저장 경로",
		"  --from-json <path>              기존 결과 JSON 사용 (반복 가능)",
		"  --title <text>                  Markdown 보고서 제목",
		"  --embedding-model-path <path>   reference 유사도용 GGUF 임베딩 모델 경로",
		"  --help                          도움말 출력",
	].join("\n");
}

export function parseArgs(argv: string[] = process.argv.slice(2)): BenchmarkArgs {
	const fromJsonPaths: string[] = [];
	let modelsPath: string | undefined;
	let filePath = "tests/data/row_data.json";
	let referenceFilePath: string | undefined;
	let limit: number | undefined;
	let index: number | undefined;
	let debug = false;
	let benchmarkOutputDir = "tmp/translate-model-benchmark";
	let reportOutputPath = "docs/TRANSLATE_MODEL_BENCHMARK_REPORT.md";
	let title = "번역 모델 벤치마크 분석";
	let embeddingModelPath = getDefaultEmbeddingModelPath();

	for (let i = 0; i < argv.length; i += 1) {
		const current = argv[i];
		const next = argv[i + 1];

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

		if (current === "--models" && next !== undefined) {
			modelsPath = next;
			i += 1;
			continue;
		}

		if (current === "--file" && next !== undefined) {
			filePath = next;
			i += 1;
			continue;
		}

		if (current === "--reference-file" && next !== undefined) {
			referenceFilePath = next;
			i += 1;
			continue;
		}

		if (current === "--limit" && next !== undefined) {
			limit = Number(next);
			i += 1;
			continue;
		}

		if (current === "--index" && next !== undefined) {
			index = Number(next);
			i += 1;
			continue;
		}

		if (current === "--benchmark-output-dir" && next !== undefined) {
			benchmarkOutputDir = next;
			i += 1;
			continue;
		}

		if (current === "--report-output" && next !== undefined) {
			reportOutputPath = next;
			i += 1;
			continue;
		}

		if (current === "--from-json" && next !== undefined) {
			fromJsonPaths.push(next);
			i += 1;
			continue;
		}

		if (current === "--title" && next !== undefined) {
			title = next;
			i += 1;
			continue;
		}

		if (current === "--embedding-model-path" && next !== undefined) {
			embeddingModelPath = next;
			i += 1;
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

	const parsed: BenchmarkArgs = {
		filePath,
		debug,
		benchmarkOutputDir,
		reportOutputPath,
		fromJsonPaths,
		title,
		embeddingModelPath,
	};
	if (modelsPath !== undefined) {
		parsed.modelsPath = modelsPath;
	}
	if (referenceFilePath !== undefined) {
		parsed.referenceFilePath = referenceFilePath;
	}
	if (limit !== undefined) {
		parsed.limit = limit;
	}
	if (index !== undefined) {
		parsed.index = index;
	}

	return parsed;
}

function resolveFromCwd(path: string): string {
	return isAbsolute(path) ? path : join(process.cwd(), path);
}

function readJson(path: string): unknown {
	return JSON.parse(readFileSync(resolveFromCwd(path), "utf8"));
}

function asObject(value: unknown, label: string): JsonObject {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label} must be an object`);
	}
	return value as JsonObject;
}

function roundMetric(value: number): number {
	return Number(value.toFixed(3));
}

function hasKorean(text: string): boolean {
	return /[가-힣]/u.test(text);
}

function countTokensWithEncoding(
	encoding: ReturnType<typeof get_encoding>,
	text: string,
): number {
	return encoding.encode(text).length;
}

export function calculateCosineSimilarity(
	actualVector: Float32Array,
	referenceVector: Float32Array,
): number {
	const length = Math.min(actualVector.length, referenceVector.length);
	if (length === 0) {
		return 0;
	}

	let dot = 0;
	let actualNorm = 0;
	let referenceNorm = 0;
	for (let index = 0; index < length; index += 1) {
		const actual = actualVector[index] ?? 0;
		const reference = referenceVector[index] ?? 0;
		dot += actual * reference;
		actualNorm += actual * actual;
		referenceNorm += reference * reference;
	}

	if (actualNorm === 0 || referenceNorm === 0) {
		return 0;
	}

	return roundMetric(dot / (Math.sqrt(actualNorm) * Math.sqrt(referenceNorm)));
}

function resolveEmbeddingModelPath(path: string): string {
	const absolutePath = resolveFromCwd(path);
	if (!existsSync(absolutePath)) {
		throw new Error(`임베딩 모델 경로를 찾을 수 없습니다: ${absolutePath}`);
	}

	if (statSync(absolutePath).isDirectory()) {
		const modelPath = join(absolutePath, DEFAULT_EMBEDDING_MODEL_FILE);
		if (!existsSync(modelPath)) {
			throw new Error(`임베딩 GGUF 파일을 찾을 수 없습니다: ${modelPath}`);
		}
		return modelPath;
	}

	return absolutePath;
}

class ReferenceSimilarityScorer {
	private readonly service: EmbeddingService;
	private readonly cache = new Map<string, Float32Array>();

	private constructor(modelPath: string) {
		this.service = new EmbeddingService(modelPath);
	}

	static async create(modelPath: string): Promise<ReferenceSimilarityScorer> {
		const scorer = new ReferenceSimilarityScorer(resolveEmbeddingModelPath(modelPath));
		await scorer.service.init();
		return scorer;
	}

	async score(actual: string, reference: string): Promise<number> {
		const actualText = actual.trim();
		const referenceText = reference.trim();
		if (!actualText || !referenceText) {
			return 0;
		}

		const [actualVector, referenceVector] = await Promise.all([
			this.embedCached(actualText),
			this.embedCached(referenceText),
		]);
		return calculateCosineSimilarity(actualVector, referenceVector);
	}

	async dispose(): Promise<void> {
		await this.service.dispose();
	}

	private async embedCached(text: string): Promise<Float32Array> {
		const cached = this.cache.get(text);
		if (cached) {
			return cached;
		}

		const vector = await this.service.embed(text);
		this.cache.set(text, vector);
		return vector;
	}
}

export function loadInputRecords(
	filePath: string,
	options: Pick<BenchmarkArgs, "limit" | "index"> = {},
): InputRecord[] {
	const parsed = asObject(readJson(filePath), "input file");
	const data = parsed.data;

	if (!Array.isArray(data) || !data.every((item) => typeof item === "string")) {
		throw new Error(`Invalid input file shape: ${resolveFromCwd(filePath)}`);
	}

	if (options.index !== undefined) {
		const item = data[options.index];
		if (typeof item !== "string") {
			throw new Error(`Index out of range: ${options.index}`);
		}
		return [{ index: options.index, raw_input: item }];
	}

	const rows = options.limit !== undefined ? data.slice(0, options.limit) : data;
	return rows.map((rawInput, index) => ({
		index,
		raw_input: rawInput,
	}));
}

export function loadReferenceMap(
	referenceFilePath: string | undefined,
): Map<number, string> {
	const references = new Map<number, string>();
	if (!referenceFilePath) {
		return references;
	}

	const parsed = asObject(readJson(referenceFilePath), "reference file");
	const data = parsed.data;
	if (!Array.isArray(data)) {
		throw new Error(`Invalid reference file shape: ${resolveFromCwd(referenceFilePath)}`);
	}

	for (const item of data) {
		const record = asObject(item, "reference item") as Partial<ReferenceRecord>;
		const index = record.index;
		if (
			typeof index !== "number" ||
			!Number.isInteger(index) ||
			typeof record.reference !== "string"
		) {
			throw new Error("reference item must have index and reference");
		}
		references.set(index, record.reference);
	}

	return references;
}

export function loadModelSpecs(modelsPath: string | undefined): ModelSpec[] {
	if (!modelsPath) {
		const config = loadRole1RuntimeConfig();
		return [
			{
				name: config.localLlmModelName ?? "current-model",
				env: {},
			},
		];
	}

	const parsed = asObject(readJson(modelsPath), "models file");
	const models = parsed.models;
	if (!Array.isArray(models) || models.length === 0) {
		throw new Error("models file must include a non-empty models array");
	}

	return models.map((model, index) => {
		const record = asObject(model, `models[${index}]`);
		if (typeof record.name !== "string" || record.name.trim() === "") {
			throw new Error(`models[${index}].name must be a non-empty string`);
		}
		const envRecord = record.env ?? {};
		if (!envRecord || typeof envRecord !== "object" || Array.isArray(envRecord)) {
			throw new Error(`models[${index}].env must be an object`);
		}
		const env: Record<string, string> = {};
		for (const [key, value] of Object.entries(envRecord as JsonObject)) {
			if (typeof value !== "string") {
				throw new Error(`models[${index}].env.${key} must be a string`);
			}
			env[key] = value;
		}
		return {
			name: record.name,
			env,
		};
	});
}

export function buildModelRuntimeEnv(
	model: ModelSpec,
	options: Pick<BenchmarkArgs, "debug">,
	baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
	return {
		...baseEnv,
		...(options.debug ? { PIPELINE_MODE: "debug" } : {}),
		...model.env,
	};
}

async function makeReferenceMetrics(
	translatedText: string,
	reference: string | undefined,
	scorer: ReferenceSimilarityScorer | null,
): Promise<Pick<
	TranslateBenchmarkItem,
	"reference" | "reference_similarity" | "reference_pass"
>> {
	if (reference === undefined) {
		return {};
	}

	if (!scorer) {
		return { reference };
	}

	const similarity = await scorer.score(translatedText, reference);
	return {
		reference,
		reference_similarity: similarity,
		reference_pass: similarity >= 0.75,
	};
}

function summarizeInput(rawInput: string): string {
	const singleLine = rawInput.replace(/\s+/gu, " ").trim();
	return singleLine.length <= 80 ? singleLine : `${singleLine.slice(0, 77)}...`;
}

async function createResultItem(
	record: InputRecord,
	result: TranslateToEnglishResult,
	reference: string | undefined,
	encoding: ReturnType<typeof get_encoding>,
	scorer: ReferenceSimilarityScorer | null,
): Promise<TranslateBenchmarkItem> {
	const translatedText = result.text;
	return {
		index: record.index,
		raw_input: record.raw_input,
		translated_text: translatedText,
		status: result.validation_errors.length > 0 ? "failed" : "completed",
		inference_time_sec: roundMetric(result.inference_time_sec),
		input_tokens: countTokensWithEncoding(encoding, record.raw_input),
		output_tokens: countTokensWithEncoding(encoding, translatedText),
		validation_errors: result.validation_errors,
		repair_actions: result.repair_actions,
		fallback_span_count: result.fallback_span_count,
		korean_remaining: hasKorean(translatedText),
		...(await makeReferenceMetrics(translatedText, reference, scorer)),
	};
}

async function createFailedItem(
	record: InputRecord,
	error: unknown,
	reference: string | undefined,
	encoding: ReturnType<typeof get_encoding>,
	scorer: ReferenceSimilarityScorer | null,
): Promise<TranslateBenchmarkItem> {
	const message = error instanceof Error ? error.message : String(error);
	return {
		index: record.index,
		raw_input: record.raw_input,
		translated_text: "",
		status: "failed",
		inference_time_sec: 0,
		input_tokens: countTokensWithEncoding(encoding, record.raw_input),
		output_tokens: 0,
		validation_errors: [],
		repair_actions: [],
		fallback_span_count: 0,
		korean_remaining: false,
		...(await makeReferenceMetrics("", reference, scorer)),
		error: message,
	};
}

function average(values: readonly number[]): number {
	return values.length > 0
		? roundMetric(values.reduce((sum, value) => sum + value, 0) / values.length)
		: 0;
}

export function computeSummary(
	modelName: string,
	results: readonly TranslateBenchmarkItem[],
): TranslateBenchmarkSummary {
	const completedCount = results.filter((item) => item.status === "completed").length;
	const failedCount = results.length - completedCount;
	const referenceSimilarities = results
		.map((item) => item.reference_similarity)
		.filter((value): value is number => typeof value === "number");
	const summary: TranslateBenchmarkSummary = {
		model_name: modelName,
		input_count: results.length,
		completed_count: completedCount,
		failed_count: failedCount,
		success_rate: results.length > 0 ? roundMetric((completedCount / results.length) * 100) : 0,
		average_inference_time_sec: average(
			results
				.map((item) => item.inference_time_sec)
				.filter((value) => value > 0),
		),
		average_output_tokens: average(results.map((item) => item.output_tokens)),
		validation_failed_count: results.filter(
			(item) => item.validation_errors.length > 0,
		).length,
		korean_remaining_count: results.filter((item) => item.korean_remaining).length,
		fallback_span_count: results.reduce(
			(sum, item) => sum + item.fallback_span_count,
			0,
		),
	};

	if (referenceSimilarities.length > 0) {
		summary.average_reference_similarity = average(referenceSimilarities);
	}

	return summary;
}

function safeFileSegment(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/gu, "-")
		.replace(/^-+|-+$/gu, "")
		.slice(0, 80) || "model";
}

async function runBenchmarkForModel(
	model: ModelSpec,
	inputs: readonly InputRecord[],
	references: ReadonlyMap<number, string>,
	args: BenchmarkArgs,
	scorer: ReferenceSimilarityScorer | null,
): Promise<TranslateBenchmarkFile> {
	const env = buildModelRuntimeEnv(model, args);
	const config = loadRole1RuntimeConfig({ env });
	const policies = loadRole1Policies();
	const encoding = get_encoding("o200k_base");
	const results: TranslateBenchmarkItem[] = [];

	try {
		for (const [position, record] of inputs.entries()) {
			process.stdout.write(
				`(${position + 1}/${inputs.length}) ${model.name} 번역 중: ${summarizeInput(record.raw_input)}\n`,
			);
			const reference = references.get(record.index);
			try {
				const result = await translate_to_english(record.raw_input, {
					config,
					policies,
				});
				results.push(await createResultItem(record, result, reference, encoding, scorer));
			} catch (error) {
				results.push(await createFailedItem(record, error, reference, encoding, scorer));
			}
		}
	} finally {
		encoding.free();
		await shutdownManagedLocalLlmRuntime();
	}

	const modelName = config.localLlmModelName ?? model.name;
	return {
		summary: computeSummary(modelName, results),
		run_metadata: {
			generated_at: new Date().toISOString(),
			mode: "translate-only",
			model_name: modelName,
			source_file: args.filePath,
			input_count: inputs.length,
		},
		results,
	};
}

function writeJsonFile(path: string, content: unknown): void {
	const absolutePath = resolveFromCwd(path);
	mkdirSync(dirname(absolutePath), { recursive: true });
	writeFileSync(absolutePath, JSON.stringify(content, null, 2), "utf8");
}

function inferModelNameFromPath(path: string): string {
	const fileName = basename(path);
	const extension = extname(fileName);
	return extension ? fileName.slice(0, -extension.length) : fileName;
}

function toNumber(value: unknown, fallback = 0): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function normalizeExistingResult(
	item: unknown,
	encoding: ReturnType<typeof get_encoding>,
): TranslateBenchmarkItem {
	const record = asObject(item, "benchmark result");
	const translatedText =
		typeof record.translated_text === "string"
			? record.translated_text
			: typeof record.normalized_input === "string"
				? record.normalized_input
				: typeof record.compiled_prompt === "string"
					? record.compiled_prompt
					: "";
	const rawInput = typeof record.raw_input === "string" ? record.raw_input : "";
	const validationErrors = toStringArray(record.validation_errors);
	const status =
		record.status === "completed" && validationErrors.length === 0
			? "completed"
			: "failed";
	const reference = typeof record.reference === "string" ? record.reference : undefined;
	const referenceSimilarity = toNumber(record.reference_similarity, NaN);
	const hasReferenceSimilarity = Number.isFinite(referenceSimilarity);
	return {
		index: toNumber(record.index),
		raw_input: rawInput,
		translated_text: translatedText,
		status,
		inference_time_sec: toNumber(record.inference_time_sec),
		input_tokens: toNumber(
			record.input_tokens,
			toNumber(record.input_prompt_tokens, countTokensWithEncoding(encoding, rawInput)),
		),
		output_tokens: toNumber(
			record.output_tokens,
			toNumber(record.normalized_input_tokens, countTokensWithEncoding(encoding, translatedText)),
		),
		validation_errors: validationErrors,
		repair_actions: toStringArray(record.repair_actions),
		fallback_span_count: toNumber(record.fallback_span_count),
		korean_remaining:
			typeof record.korean_remaining === "boolean"
				? record.korean_remaining
				: hasKorean(translatedText),
		...(reference !== undefined ? { reference } : {}),
		...(hasReferenceSimilarity
			? {
					reference_similarity: referenceSimilarity,
					reference_pass:
						typeof record.reference_pass === "boolean"
							? record.reference_pass
							: referenceSimilarity >= 0.75,
				}
			: {}),
		...(typeof record.error === "string" ? { error: record.error } : {}),
	};
}

export function loadReportModelDataFromJson(path: string): ReportModelData {
	const parsed = asObject(readJson(path), "benchmark json");
	const runMetadata =
		parsed.run_metadata && typeof parsed.run_metadata === "object"
			? (parsed.run_metadata as JsonObject)
			: {};
	const summaryObject =
		parsed.summary && typeof parsed.summary === "object"
			? (parsed.summary as JsonObject)
			: {};
	const modelName =
		typeof runMetadata.model_name === "string"
			? runMetadata.model_name
			: typeof runMetadata.model === "string"
				? runMetadata.model
				: typeof summaryObject.model_name === "string"
					? summaryObject.model_name
					: inferModelNameFromPath(path);

	if (!Array.isArray(parsed.results)) {
		throw new Error(`benchmark json must include results array: ${resolveFromCwd(path)}`);
	}

	const encoding = get_encoding("o200k_base");
	try {
		const results = parsed.results.map((item) =>
			normalizeExistingResult(item, encoding),
		);
		return {
			modelName,
			sourcePath: path,
			summary: computeSummary(modelName, results),
			results,
		};
	} finally {
		encoding.free();
	}
}

async function applyReferenceMetricsToReportModels(
	models: readonly ReportModelData[],
	references: ReadonlyMap<number, string>,
	scorer: ReferenceSimilarityScorer | null,
): Promise<ReportModelData[]> {
	if (references.size === 0 || !scorer) {
		return [...models];
	}

	const updatedModels: ReportModelData[] = [];
	for (const model of models) {
		const results: TranslateBenchmarkItem[] = [];
		for (const item of model.results) {
			const reference = references.get(item.index) ?? item.reference;
			if (reference === undefined || item.status !== "completed") {
				results.push(item);
				continue;
			}

			results.push({
				...item,
				...(await makeReferenceMetrics(item.translated_text, reference, scorer)),
			});
		}

		updatedModels.push({
			...model,
			summary: computeSummary(model.modelName, results),
			results,
		});
	}

	return updatedModels;
}

function escapeTableCell(value: string | number | undefined): string {
	if (value === undefined) {
		return "-";
	}
	return String(value).replace(/\|/gu, "\\|").replace(/\n/gu, " ");
}

function formatNumber(value: number | undefined, suffix = ""): string {
	return value === undefined ? "-" : `${value.toFixed(3)}${suffix}`;
}

function renderBar(value: number, max: number, width = 24): string {
	const safeMax = max > 0 ? max : 1;
	const filled = Math.round(Math.min(Math.max(value / safeMax, 0), 1) * width);
	return `${"#".repeat(filled)}${"-".repeat(width - filled)}`;
}

function renderMetricBars(
	models: readonly ReportModelData[],
	metric: keyof TranslateBenchmarkSummary,
	label: string,
	suffix = "",
): string[] {
	const values = models.map((model) => {
		const value = model.summary[metric];
		return typeof value === "number" ? value : 0;
	});
	const maxValue = metric === "success_rate" ? 100 : Math.max(...values, 1);
	const lines = [`### ${label}`, "", "| 모델 | 값 | 시각화 |", "| --- | ---: | --- |"];
	for (const model of models) {
		const value = model.summary[metric];
		const numericValue = typeof value === "number" ? value : 0;
		lines.push(
			`| ${escapeTableCell(model.modelName)} | ${formatNumber(numericValue, suffix)} | \`${renderBar(numericValue, maxValue)}\` |`,
		);
	}
	return lines;
}

function countBy(values: readonly string[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const value of values) {
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	return counts;
}

function renderFailureAnalysis(models: readonly ReportModelData[]): string[] {
	const lines = ["## 실패/검증 오류 요약", ""];
	for (const model of models) {
		const errors = model.results.flatMap((item) => [
			...item.validation_errors,
			...(item.error ? [item.error] : []),
		]);
		lines.push(`### ${model.modelName}`);
		if (errors.length === 0) {
			lines.push("", "실패 또는 검증 오류가 없습니다.", "");
			continue;
		}

		lines.push("", "| 오류 | 발생 수 |", "| --- | ---: |");
		for (const [error, count] of [...countBy(errors).entries()].sort(
			(a, b) => b[1] - a[1],
		)) {
			lines.push(`| ${escapeTableCell(error)} | ${count} |`);
		}
		lines.push("");
	}
	return lines;
}

function pickSlowSamples(results: readonly TranslateBenchmarkItem[]): TranslateBenchmarkItem[] {
	return [...results]
		.filter((item) => item.inference_time_sec > 0)
		.sort((a, b) => b.inference_time_sec - a.inference_time_sec)
		.slice(0, 3);
}

function pickLowQualitySamples(results: readonly TranslateBenchmarkItem[]): TranslateBenchmarkItem[] {
	return [...results]
		.filter((item) => item.reference_similarity !== undefined)
		.sort((a, b) => (a.reference_similarity ?? 0) - (b.reference_similarity ?? 0))
		.slice(0, 3);
}

function renderSampleRows(samples: readonly TranslateBenchmarkItem[]): string[] {
	if (samples.length === 0) {
		return ["대상 샘플이 없습니다."];
	}

	return [
		"| index | latency | ref 유사도 | 입력 | 번역 |",
		"| ---: | ---: | ---: | --- | --- |",
		...samples.map(
			(item) =>
				`| ${item.index} | ${formatNumber(item.inference_time_sec, "s")} | ${formatNumber(item.reference_similarity)} | ${escapeTableCell(item.raw_input)} | ${escapeTableCell(item.translated_text)} |`,
		),
	];
}

function renderSampleAnalysis(models: readonly ReportModelData[]): string[] {
	const lines = ["## 샘플 분석", ""];
	for (const model of models) {
		lines.push(`### ${model.modelName}`, "", "느린 샘플");
		lines.push(...renderSampleRows(pickSlowSamples(model.results)), "");
		lines.push("품질 낮은 샘플");
		lines.push(...renderSampleRows(pickLowQualitySamples(model.results)), "");
		const failedSamples = model.results
			.filter((item) => item.status === "failed")
			.slice(0, 3);
		lines.push("검증 실패 샘플");
		lines.push(...renderSampleRows(failedSamples), "");
	}
	return lines;
}

export function renderMarkdownReport(
	models: readonly ReportModelData[],
	options: Pick<BenchmarkArgs, "title" | "fromJsonPaths">,
): string {
	const generatedAt = new Date().toISOString();
	const mode = options.fromJsonPaths.length > 0 ? "기존 JSON 보고서 생성" : "번역 벤치마크 실행";
	const lines = [
		`# ${options.title}`,
		"",
		`- 생성 시각: ${generatedAt}`,
		`- 실행 모드: ${mode}`,
		`- 모델 수: ${models.length}`,
		"",
		"## 모델별 종합 비교",
		"",
		"| 모델 | 입력 수 | 성공률 | 평균 추론 시간 | 평균 출력 토큰 | 검증 실패 | 한국어 잔존 | fallback span | 평균 ref 유사도 |",
		"| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
	];

	for (const model of models) {
		const summary = model.summary;
		lines.push(
			[
				escapeTableCell(model.modelName),
				summary.input_count,
				formatNumber(summary.success_rate, "%"),
				formatNumber(summary.average_inference_time_sec, "s"),
				formatNumber(summary.average_output_tokens),
				summary.validation_failed_count,
				summary.korean_remaining_count,
				summary.fallback_span_count,
				formatNumber(summary.average_reference_similarity),
			].join(" | ").replace(/^/u, "| ").replace(/$/u, " |"),
		);
	}

	lines.push(
		"",
		"## 텍스트 막대 시각화",
		"",
		...renderMetricBars(models, "success_rate", "성공률", "%"),
		"",
		...renderMetricBars(models, "average_inference_time_sec", "평균 latency", "s"),
		"",
		...renderMetricBars(models, "average_reference_similarity", "reference similarity"),
		"",
		...renderMetricBars(models, "validation_failed_count", "validation failure count"),
		"",
		...renderFailureAnalysis(models),
		...renderSampleAnalysis(models),
	);

	return `${lines.join("\n")}\n`;
}

async function runBenchmarkMode(args: BenchmarkArgs): Promise<ReportModelData[]> {
	const models = loadModelSpecs(args.modelsPath);
	const inputs = loadInputRecords(args.filePath, args);
	const references = loadReferenceMap(args.referenceFilePath);
	const outputDir = resolveFromCwd(args.benchmarkOutputDir);
	mkdirSync(outputDir, { recursive: true });
	const timestamp = new Date().toISOString().replace(/[:.]/gu, "-");
	const reportModels: ReportModelData[] = [];
	const scorer = references.size > 0
		? await ReferenceSimilarityScorer.create(args.embeddingModelPath)
		: null;

	try {
		for (const model of models) {
			const benchmark = await runBenchmarkForModel(
				model,
				inputs,
				references,
				args,
				scorer,
			);
			const outputPath = join(
				outputDir,
				`${timestamp}-${safeFileSegment(model.name)}.json`,
			);
			writeJsonFile(outputPath, benchmark);
			process.stdout.write(`벤치마크 JSON 저장: ${outputPath}\n`);
			reportModels.push({
				modelName: benchmark.summary.model_name,
				sourcePath: outputPath,
				summary: benchmark.summary,
				results: benchmark.results,
			});
		}
	} finally {
		await scorer?.dispose();
	}

	return reportModels;
}

async function main(): Promise<void> {
	const args = parseArgs();
	let reportModels = args.fromJsonPaths.length > 0
		? args.fromJsonPaths.map((path) => loadReportModelDataFromJson(path))
		: await runBenchmarkMode(args);
	if (args.fromJsonPaths.length > 0 && args.referenceFilePath) {
		const references = loadReferenceMap(args.referenceFilePath);
		const scorer = references.size > 0
			? await ReferenceSimilarityScorer.create(args.embeddingModelPath)
			: null;
		try {
			reportModels = await applyReferenceMetricsToReportModels(
				reportModels,
				references,
				scorer,
			);
		} finally {
			await scorer?.dispose();
		}
	}

	const markdown = renderMarkdownReport(reportModels, args);
	const reportOutputPath = resolveFromCwd(args.reportOutputPath);
	mkdirSync(dirname(reportOutputPath), { recursive: true });
	writeFileSync(reportOutputPath, markdown, "utf8");
	process.stdout.write(`Markdown 보고서 저장: ${reportOutputPath}\n`);
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
