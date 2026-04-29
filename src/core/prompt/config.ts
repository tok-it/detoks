import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const DEFAULT_REQUEST_TIMEOUT = 30_000;
const DEFAULT_TRANSLATION_MAX_ATTEMPTS = 5;
const DEFAULT_TEMPERATURE = 0;
const DEFAULT_LOCAL_LLM_API_BASE = "http://127.0.0.1:12370/v1";
const DEFAULT_LOCAL_LLM_MODEL_NAME =
	"mradermacher/gemma-4-e2b-it-heretic-ara-GGUF:Q4_K_S";
const DEFAULT_LOCAL_LLM_HF_REPO =
	"mradermacher/gemma-4-e2b-it-heretic-ara-GGUF:Q4_K_S";
const DEFAULT_LOCAL_LLM_HF_FILE = "gemma-4-e2b-it-heretic-ara.Q4_K_S.gguf";
const DEFAULT_LOCAL_LLM_SERVER_BINARY = "llama-server";
const DEFAULT_LOCAL_LLM_SERVER_HOST = "127.0.0.1";
const DEFAULT_LOCAL_LLM_SERVER_PORT = 12370;
const DEFAULT_LOCAL_LLM_STARTUP_TIMEOUT = 600_000;
const DEFAULT_LOCAL_LLM_GPU_LAYERS = "all";
const DEFAULT_LOCAL_LLM_CONTEXT_SIZE = 4096;
const DEFAULT_LOCAL_LLM_TOP_K = 40;
const DEFAULT_LOCAL_LLM_TOP_P = 0.95;
const DEFAULT_LOCAL_LLM_SLEEP_IDLE_SECONDS = 1200;
const DEFAULT_LOCAL_LLM_MAX_TOKENS = 512;
const DEFAULT_LOCAL_LLM_REASONING = "off";
const DEFAULT_KOMPRESS_PYTHON_BIN = "python3";
const DEFAULT_KOMPRESS_MODEL_ID = "chopratejas/kompress-base";
const DEFAULT_KOMPRESS_STARTUP_TIMEOUT = 120_000;

const PipelineModeSchema = z.enum(["safe", "debug"]);

const Role1RuntimeConfigSchema = z.object({
	localLlmApiBase: z.string().optional(),
	localLlmApiKey: z.string().optional(),
	localLlmModelName: z.string().optional(),
	localLlmAutoStart: z.boolean().optional(),
	localLlmServerBinary: z.string().optional(),
	localLlmServerHost: z.string().optional(),
	localLlmServerPort: z.number().int().positive().optional(),
	localLlmStartupTimeout: z.number().int().positive().optional(),
	localLlmDevice: z.string().optional(),
	localLlmGpuLayers: z.string().optional(),
	localLlmContextSize: z.number().int().positive().optional(),
	localLlmTopK: z.number().int().min(0).optional(),
	localLlmTopP: z.number().min(0).max(1).optional(),
	localLlmSleepIdleSeconds: z.number().int().min(0).optional(),
	localLlmMaxTokens: z.number().int().positive().optional(),
	localLlmReasoning: z.string().optional(),
	localLlmModelPath: z.string().optional(),
	localLlmModelUrl: z.string().optional(),
	localLlmHfRepo: z.string().optional(),
	localLlmHfFile: z.string().optional(),
	kompressPythonBin: z.string().optional(),
	kompressModelId: z.string().optional(),
	kompressStartupTimeout: z.number().int().positive().optional(),
	pipelineMode: PipelineModeSchema,
	requestTimeout: z.number().int().positive(),
	translationMaxAttempts: z.number().int().positive(),
	temperature: z.number().min(0),
});

const ProtectedTermsSchema = z.array(z.string().min(1));
const PreferredTranslationsSchema = z.record(z.string(), z.string());
const ForbiddenPatternsSchema = z.array(z.string().min(1));

const Role1PoliciesSchema = z.object({
	protectedTerms: ProtectedTermsSchema,
	preferredTranslations: PreferredTranslationsSchema,
	forbiddenPatterns: ForbiddenPatternsSchema,
});

export type PipelineMode = z.infer<typeof PipelineModeSchema>;
export type Role1RuntimeConfig = z.infer<typeof Role1RuntimeConfigSchema>;
export type Role1Policies = z.infer<typeof Role1PoliciesSchema>;

interface LoaderOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
}

function parseEnvFile(content: string): Record<string, string> {
	const parsed: Record<string, string> = {};

	for (const rawLine of content.split(/\r?\n/u)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) {
			continue;
		}

		const normalized = line.startsWith("export ")
			? line.slice("export ".length)
			: line;
		const separatorIndex = normalized.indexOf("=");

		if (separatorIndex <= 0) {
			continue;
		}

		const key = normalized.slice(0, separatorIndex).trim();
		let value = normalized.slice(separatorIndex + 1).trim();

		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}

		parsed[key] = value;
	}

	return parsed;
}

function loadDotEnv(cwd: string): Record<string, string> {
	const envFiles = [".env", ".env.local"];

	return envFiles.reduce<Record<string, string>>((acc, fileName) => {
		const filePath = join(cwd, fileName);
		if (!existsSync(filePath)) {
			return acc;
		}

		return {
			...acc,
			...parseEnvFile(readFileSync(filePath, "utf8")),
		};
	}, {});
}

function parseNumber(
	value: string | undefined,
	fallback: number,
	fieldName: string,
): number {
	if (value === undefined) {
		return fallback;
	}

	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		throw new Error(`Invalid numeric env value: ${fieldName}`);
	}

	return parsed;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
	if (value === undefined) {
		return fallback;
	}

	return ["1", "true", "on", "yes"].includes(value.toLowerCase());
}

function readJsonFile<T>(
	filePath: string,
	schema: z.ZodSchema<T>,
	fallback: T,
): T {
	if (!existsSync(filePath)) {
		return fallback;
	}

	try {
		const parsed = JSON.parse(readFileSync(filePath, "utf8"));
		return schema.parse(parsed);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Invalid policy file: ${filePath} (${message})`);
	}
}

export function loadRole1RuntimeConfig(
	options: LoaderOptions = {},
): Role1RuntimeConfig {
	const cwd = options.cwd ?? process.cwd();
	const fileEnv = loadDotEnv(cwd);
	const overrideEnv = options.env ?? process.env;
	const env = { ...fileEnv, ...overrideEnv };

	const findEnv = (
		...keys: string[]
	): { found: true; value: string | undefined } | { found: false } => {
		for (const key of keys) {
			if (overrideEnv[key] !== undefined) {
				return { found: true, value: overrideEnv[key] };
			}
		}
		for (const key of keys) {
			if (fileEnv[key] !== undefined) {
				return { found: true, value: fileEnv[key] };
			}
		}
		return { found: false };
	};

	const pickEnv = (...keys: string[]): string | undefined => {
		const result = findEnv(...keys);
		return result.found ? result.value?.trim() || undefined : undefined;
	};

	const pickEnvWithDefault = (
		keys: string[],
		fallback: string,
	): string | undefined => {
		const result = findEnv(...keys);
		if (!result.found) {
			return fallback;
		}
		return result.value?.trim() || undefined;
	};

	const pipelineMode = env.PIPELINE_MODE ?? "safe";

	return Role1RuntimeConfigSchema.parse({
		localLlmApiBase: pickEnvWithDefault(
			["LOCAL_LLM_API_BASE", "OPENAI_API_BASE", "LM_STUDIO_URL"],
			DEFAULT_LOCAL_LLM_API_BASE,
		),
		localLlmApiKey: pickEnv(
			"LOCAL_LLM_API_KEY",
			"OPENAI_API_KEY",
			"LM_STUDIO_API_KEY",
		),
		localLlmModelName: pickEnvWithDefault(
			["LOCAL_LLM_MODEL_NAME", "MODEL_NAME"],
			DEFAULT_LOCAL_LLM_MODEL_NAME,
		),
		localLlmAutoStart: parseBoolean(env.LOCAL_LLM_AUTO_START, true),
		localLlmServerBinary:
			pickEnv("LOCAL_LLM_SERVER_BINARY") ?? DEFAULT_LOCAL_LLM_SERVER_BINARY,
		localLlmServerHost:
			pickEnv("LOCAL_LLM_SERVER_HOST") ?? DEFAULT_LOCAL_LLM_SERVER_HOST,
		localLlmServerPort: parseNumber(
			env.LOCAL_LLM_SERVER_PORT,
			DEFAULT_LOCAL_LLM_SERVER_PORT,
			"LOCAL_LLM_SERVER_PORT",
		),
		localLlmStartupTimeout: parseNumber(
			env.LOCAL_LLM_STARTUP_TIMEOUT,
			DEFAULT_LOCAL_LLM_STARTUP_TIMEOUT,
			"LOCAL_LLM_STARTUP_TIMEOUT",
		),
		localLlmDevice: pickEnv("LOCAL_LLM_DEVICE"),
		localLlmGpuLayers:
			pickEnv("LOCAL_LLM_GPU_LAYERS") ?? DEFAULT_LOCAL_LLM_GPU_LAYERS,
		localLlmContextSize: parseNumber(
			env.LOCAL_LLM_CONTEXT_SIZE,
			DEFAULT_LOCAL_LLM_CONTEXT_SIZE,
			"LOCAL_LLM_CONTEXT_SIZE",
		),
		localLlmTopK: parseNumber(
			pickEnv("LOCAL_LLM_TOP_K"),
			DEFAULT_LOCAL_LLM_TOP_K,
			"LOCAL_LLM_TOP_K",
		),
		localLlmTopP: parseNumber(
			pickEnv("LOCAL_LLM_TOP_P"),
			DEFAULT_LOCAL_LLM_TOP_P,
			"LOCAL_LLM_TOP_P",
		),
		localLlmSleepIdleSeconds: parseNumber(
			pickEnv("LOCAL_LLM_SLEEP_IDLE_SECONDS"),
			DEFAULT_LOCAL_LLM_SLEEP_IDLE_SECONDS,
			"LOCAL_LLM_SLEEP_IDLE_SECONDS",
		),
		localLlmMaxTokens: parseNumber(
			env.LOCAL_LLM_MAX_TOKENS,
			DEFAULT_LOCAL_LLM_MAX_TOKENS,
			"LOCAL_LLM_MAX_TOKENS",
		),
		localLlmReasoning:
			pickEnv("LOCAL_LLM_REASONING") ?? DEFAULT_LOCAL_LLM_REASONING,
		localLlmModelPath: pickEnv("LOCAL_LLM_MODEL_PATH"),
		localLlmModelUrl: pickEnv("LOCAL_LLM_MODEL_URL"),
		localLlmHfRepo: pickEnv("LOCAL_LLM_HF_REPO") ?? DEFAULT_LOCAL_LLM_HF_REPO,
		localLlmHfFile: pickEnv("LOCAL_LLM_HF_FILE") ?? DEFAULT_LOCAL_LLM_HF_FILE,
		kompressPythonBin:
			pickEnv("KOMPRESS_PYTHON_BIN") ?? DEFAULT_KOMPRESS_PYTHON_BIN,
		kompressModelId: pickEnv("KOMPRESS_MODEL_ID") ?? DEFAULT_KOMPRESS_MODEL_ID,
		kompressStartupTimeout: parseNumber(
			env.KOMPRESS_STARTUP_TIMEOUT,
			DEFAULT_KOMPRESS_STARTUP_TIMEOUT,
			"KOMPRESS_STARTUP_TIMEOUT",
		),
		pipelineMode,
		requestTimeout: parseNumber(
			env.REQUEST_TIMEOUT,
			DEFAULT_REQUEST_TIMEOUT,
			"REQUEST_TIMEOUT",
		),
		translationMaxAttempts: parseNumber(
			env.TRANSLATION_MAX_ATTEMPTS,
			DEFAULT_TRANSLATION_MAX_ATTEMPTS,
			"TRANSLATION_MAX_ATTEMPTS",
		),
		temperature: parseNumber(
			env.TEMPERATURE,
			DEFAULT_TEMPERATURE,
			"TEMPERATURE",
		),
	});
}

export function loadRole1Policies(
	options: Pick<LoaderOptions, "cwd"> = {},
): Role1Policies {
	const cwd = options.cwd ?? process.cwd();
	const dataDir = join(cwd, "data");

	return Role1PoliciesSchema.parse({
		protectedTerms: readJsonFile(
			join(dataDir, "protected_terms.json"),
			ProtectedTermsSchema,
			[],
		),
		preferredTranslations: readJsonFile(
			join(dataDir, "preferred_translations.json"),
			PreferredTranslationsSchema,
			{},
		),
		forbiddenPatterns: readJsonFile(
			join(dataDir, "forbidden_patterns.json"),
			ForbiddenPatternsSchema,
			[],
		),
	});
}
