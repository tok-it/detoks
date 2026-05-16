import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	buildModelRuntimeEnv,
	calculateTokenJaccardSimilarity,
	computeSummary,
	loadInputRecords,
	loadModelSpecs,
	loadReferenceMap,
	loadReportModelDataFromJson,
	parseArgs,
	renderMarkdownReport,
	type TranslateBenchmarkItem,
} from "../../../../scripts/translate-model-benchmark-report.js";

let tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "detoks-translate-bench-"));
	tempDirs.push(dir);
	return dir;
}

function writeJson(path: string, value: unknown): void {
	writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}

function makeItem(
	overrides: Partial<TranslateBenchmarkItem> = {},
): TranslateBenchmarkItem {
	return {
		index: 0,
		raw_input: "파일을 생성해",
		translated_text: "Create a file",
		status: "completed",
		inference_time_sec: 1.2,
		input_tokens: 5,
		output_tokens: 3,
		validation_errors: [],
		repair_actions: [],
		fallback_span_count: 0,
		korean_remaining: false,
		...overrides,
	};
}

afterEach(() => {
	for (const dir of tempDirs) {
		rmSync(dir, { recursive: true, force: true });
	}
	tempDirs = [];
});

describe("translate-model-benchmark-report script", () => {
	it("기본 인자는 새 번역 벤치마크 모드로 파싱한다", () => {
		const args = parseArgs([
			"--models",
			"models.json",
			"--file",
			"tests/data/row_data.json",
			"--reference-file",
			"refs.json",
			"--limit",
			"2",
			"--debug",
		]);

		expect(args).toMatchObject({
			modelsPath: "models.json",
			filePath: "tests/data/row_data.json",
			referenceFilePath: "refs.json",
			limit: 2,
			debug: true,
			fromJsonPaths: [],
		});
	});

	it("--from-json은 기존 JSON 보고서 모드로 파싱한다", () => {
		const args = parseArgs([
			"--from-json",
			"a.json",
			"--from-json",
			"b.json",
			"--report-output",
			"tmp/report.md",
		]);

		expect(args.fromJsonPaths).toEqual(["a.json", "b.json"]);
		expect(args.reportOutputPath).toBe("tmp/report.md");
	});

	it("모델 manifest를 파싱하고 env override를 구성한다", () => {
		const dir = makeTempDir();
		const modelPath = join(dir, "models.json");
		writeJson(modelPath, {
			models: [
				{
					name: "qwen3.5-4b",
					env: {
						LOCAL_LLM_MODEL_NAME: "unsloth/Qwen3.5-4B-GGUF",
						LOCAL_LLM_MODEL_PATH: "/tmp/qwen.gguf",
					},
				},
			],
		});

		const [model] = loadModelSpecs(modelPath);
		const env = buildModelRuntimeEnv(
			model!,
			{ debug: true },
			{ PIPELINE_MODE: "safe" },
		);

		expect(model).toEqual({
			name: "qwen3.5-4b",
			env: {
				LOCAL_LLM_MODEL_NAME: "unsloth/Qwen3.5-4B-GGUF",
				LOCAL_LLM_MODEL_PATH: "/tmp/qwen.gguf",
			},
		});
		expect(env.PIPELINE_MODE).toBe("debug");
		expect(env.LOCAL_LLM_MODEL_NAME).toBe("unsloth/Qwen3.5-4B-GGUF");
	});

	it("기존 { data: string[] } 입력과 reference index를 로드한다", () => {
		const dir = makeTempDir();
		const inputPath = join(dir, "input.json");
		const referencePath = join(dir, "refs.json");
		writeJson(inputPath, { data: ["첫 번째", "두 번째", "세 번째"] });
		writeJson(referencePath, {
			data: [
				{ index: 1, reference: "Second" },
				{ index: 2, reference: "Third" },
			],
		});

		expect(loadInputRecords(inputPath, { limit: 2 })).toEqual([
			{ index: 0, raw_input: "첫 번째" },
			{ index: 1, raw_input: "두 번째" },
		]);
		expect(loadInputRecords(inputPath, { index: 2 })).toEqual([
			{ index: 2, raw_input: "세 번째" },
		]);
		expect(loadReferenceMap(referencePath).get(1)).toBe("Second");
	});

	it("여러 모델 결과를 집계해 Markdown 표와 막대 시각화를 만든다", () => {
		const modelAResults = [
			makeItem({
				reference: "Create a file",
				reference_similarity: 1,
				reference_length_ratio: 1,
				reference_pass: true,
			}),
			makeItem({
				index: 1,
				raw_input: "파일을 삭제해",
				translated_text: "파일을 삭제해",
				status: "failed",
				validation_errors: ["korean_text_remaining"],
				korean_remaining: true,
				reference: "Delete a file",
				reference_similarity: 0,
				reference_length_ratio: 0.7,
				reference_pass: false,
			}),
		];
		const modelBResults = [
			makeItem({
				translated_text: "Create a file now",
				reference: "Create a file",
				reference_similarity: calculateTokenJaccardSimilarity(
					"Create a file now",
					"Create a file",
				),
			}),
		];

		const markdown = renderMarkdownReport(
			[
				{
					modelName: "model-a",
					sourcePath: "a.json",
					summary: computeSummary("model-a", modelAResults),
					results: modelAResults,
				},
				{
					modelName: "model-b",
					sourcePath: "b.json",
					summary: computeSummary("model-b", modelBResults),
					results: modelBResults,
				},
			],
			{
				title: "테스트 보고서",
				fromJsonPaths: [],
			},
		);

		expect(markdown).toContain("# 테스트 보고서");
		expect(markdown).toContain("## 모델별 종합 비교");
		expect(markdown).toContain("## 텍스트 막대 시각화");
		expect(markdown).toContain("korean_text_remaining");
		expect(markdown).toContain("model-a");
		expect(markdown).toContain("model-b");
	});

	it("기존 verify-role1 JSON도 from-json 입력으로 정규화한다", () => {
		const dir = makeTempDir();
		const resultPath = join(dir, "translate-qwen.json");
		writeJson(resultPath, {
			summary: {
				completed_count: 1,
				failed_count: 1,
			},
			run_metadata: {
				generated_at: "2026-05-16T00:00:00.000Z",
			},
			results: [
				{
					index: 0,
					raw_input: "파일을 생성해",
					normalized_input: "Create a file",
					status: "completed",
					inference_time_sec: 0.3,
					validation_errors: [],
					repair_actions: [],
				},
				{
					index: 1,
					raw_input: "파일을 삭제해",
					normalized_input: "",
					status: "failed",
					inference_time_sec: 0,
					validation_errors: [],
					repair_actions: [],
					error: "model failed",
				},
			],
		});

		const data = loadReportModelDataFromJson(resultPath);

		expect(data.modelName).toBe("translate-qwen");
		expect(data.summary.input_count).toBe(2);
		expect(data.summary.completed_count).toBe(1);
		expect(data.results[0]!.translated_text).toBe("Create a file");
		expect(data.results[1]!.error).toBe("model failed");
	});
});
