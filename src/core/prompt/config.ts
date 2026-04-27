import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const DEFAULT_REQUEST_TIMEOUT = 30_000;
const DEFAULT_TRANSLATION_MAX_ATTEMPTS = 5;
const DEFAULT_TEMPERATURE = 0;
const DEFAULT_LOCAL_LLM_API_BASE = "http://127.0.0.1:12370/v1";
const DEFAULT_LOCAL_LLM_MODEL_NAME = "mradermacher/gemma-4-E2B-it-heretic-ara-GGUF";
const DEFAULT_LOCAL_LLM_SERVER_BINARY = "llama-server";
const DEFAULT_LOCAL_LLM_SERVER_HOST = "127.0.0.1";
const DEFAULT_LOCAL_LLM_SERVER_PORT = 12370;
const DEFAULT_LOCAL_LLM_STARTUP_TIMEOUT = 600_000;

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
  localLlmModelPath: z.string().optional(),
  localLlmModelUrl: z.string().optional(),
  localLlmHfRepo: z.string().optional(),
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

function readEnvValue(
  env: Record<string, string | undefined>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function readEnvValueWithDefault(
  env: Record<string, string | undefined>,
  keys: string[],
  fallback: string,
): string | undefined {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(env, key)) {
      const value = env[key]?.trim();
      return value || undefined;
    }
  }

  return fallback;
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
  const env = { ...fileEnv, ...(options.env ?? process.env) };

  const pipelineMode = env.PIPELINE_MODE ?? "safe";

  return Role1RuntimeConfigSchema.parse({
    localLlmApiBase:
      readEnvValueWithDefault(
        env,
        ["LOCAL_LLM_API_BASE", "OPENAI_API_BASE", "LM_STUDIO_URL"],
        DEFAULT_LOCAL_LLM_API_BASE,
      ),
    localLlmApiKey:
      readEnvValue(env, "LOCAL_LLM_API_KEY", "OPENAI_API_KEY", "LM_STUDIO_API_KEY"),
    localLlmModelName:
      readEnvValueWithDefault(
        env,
        ["LOCAL_LLM_MODEL_NAME", "MODEL_NAME"],
        DEFAULT_LOCAL_LLM_MODEL_NAME,
      ),
    localLlmAutoStart: parseBoolean(env.LOCAL_LLM_AUTO_START, true),
    localLlmServerBinary:
      readEnvValue(env, "LOCAL_LLM_SERVER_BINARY") ?? DEFAULT_LOCAL_LLM_SERVER_BINARY,
    localLlmServerHost:
      readEnvValue(env, "LOCAL_LLM_SERVER_HOST") ?? DEFAULT_LOCAL_LLM_SERVER_HOST,
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
    localLlmModelPath: readEnvValue(env, "LOCAL_LLM_MODEL_PATH"),
    localLlmModelUrl: readEnvValue(env, "LOCAL_LLM_MODEL_URL"),
    localLlmHfRepo:
      readEnvValue(env, "LOCAL_LLM_HF_REPO") ?? DEFAULT_LOCAL_LLM_MODEL_NAME,
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
