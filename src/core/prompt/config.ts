import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const DEFAULT_REQUEST_TIMEOUT = 30_000;
const DEFAULT_TRANSLATION_MAX_ATTEMPTS = 5;
const DEFAULT_TEMPERATURE = 0;

const PipelineModeSchema = z.enum(["safe", "debug"]);

const Role1RuntimeConfigSchema = z.object({
  openaiApiBase: z.string().optional(),
  openaiApiKey: z.string().optional(),
  modelName: z.string().optional(),
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
    openaiApiBase: env.OPENAI_API_BASE ?? env.LM_STUDIO_URL,
    openaiApiKey: env.OPENAI_API_KEY ?? env.LM_STUDIO_API_KEY,
    modelName: env.MODEL_NAME,
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
