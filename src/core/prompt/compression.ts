import type { Role1Policies, Role1RuntimeConfig } from "./config.js";
import {
  compressTextWithKompress,
  type KompressClientOptions,
  type KompressClientResult,
} from "./kompress-client.js";
import {
  collect_preservable_literals,
  mask_protected_segments,
  type MaskProtectedSegmentsOptions,
  restore_placeholders,
  type PlaceholderEntry,
} from "../translate/masking.js";

const LEADING_FILLER_PATTERNS: readonly RegExp[] = [
  /^(?:please|kindly)\s+/i,
  /^(?:can|could|would)\s+you\s+/i,
  /^(?:i\s+(?:want|need)\s+(?:you\s+)?to)\s+/i,
  /^(?:help\s+me\s+(?:to\s+)?)\s*/i,
];

const INLINE_FILLER_PATTERNS: ReadonlyArray<[pattern: RegExp, replacement: string]> = [
  [/\bplease\b/gi, ""],
  [/\bkindly\b/gi, ""],
  [/\s{2,}/g, " "],
];

const ACTION_STARTER_REGEX =
  /\b(find|locate|trace|follow|show|read|search|explore|inspect|analyze|investigate|explain|review|compare|assess|evaluate|create|build|generate|scaffold|implement|add|make|modify|update|change|fix|patch|edit|refactor|rename|rewrite|remove|replace|improve|optimi[sz]e|tune|correct|test|validate|verify|confirm|ensure|lint|typecheck|run|execute|deploy|start|launch|restart|stop|install|migrate|seed|serve|document|summari[sz]e|describe|write|prepare|plan|design|outline|propose|check)\b/i;

const PLACEHOLDER_REGEX = /__PH_\d{4}__/g;

export interface CompressPromptOptions {
  policies: Role1Policies;
  config: Pick<
    Role1RuntimeConfig,
    "kompressPythonBin" | "kompressModelId" | "kompressStartupTimeout" | "requestTimeout"
  >;
  localLlmModelName?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  compressionImplementation?: CompressTextImplementation;
}

export interface CompressPromptResult {
  compressed_prompt: string;
  repair_actions: string[];
}

export type CompressTextImplementation = (
  text: string,
  options: KompressClientOptions,
) => Promise<KompressClientResult>;

function normalizeWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function preserveTerminalPunctuation(source: string, compressed: string): string {
  if (!compressed) {
    return compressed;
  }

  const terminal = source.match(/[.!?]+$/)?.[0];
  if (!terminal || /[.!?]+$/.test(compressed)) {
    return compressed;
  }

  return `${compressed}${terminal}`;
}

function restoreImperativeCase(source: string, compressed: string): string {
  if (!compressed) {
    return compressed;
  }

  const firstSourceChar = source.trim()[0];
  const firstCompressedChar = compressed[0];

  if (!firstSourceChar || !firstCompressedChar) {
    return compressed;
  }

  if (/[A-Z]/.test(firstSourceChar)) {
    return firstCompressedChar.toUpperCase() + compressed.slice(1);
  }

  return compressed;
}

function shouldUseKompress(text: string): boolean {
  const withoutPlaceholders = text.replace(PLACEHOLDER_REGEX, " ").trim();
  if (!/[A-Za-z]/.test(withoutPlaceholders)) {
    return false;
  }

  const wordCount = withoutPlaceholders
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean).length;

  return wordCount >= 10;
}

function normalizeShortBody(text: string): string {
  let output = text.trim();

  for (const pattern of LEADING_FILLER_PATTERNS) {
    output = output.replace(pattern, "");
  }

  output = INLINE_FILLER_PATTERNS.reduce((next, [pattern, replacement]) => {
    return next.replace(pattern, replacement);
  }, output);
  output = normalizeWhitespace(output);
  output = restoreImperativeCase(text, output);
  output = preserveTerminalPunctuation(text, output);

  return output;
}

async function compressNaturalLanguageSegment(
  segment: string,
  options: CompressPromptOptions,
): Promise<string> {
  const source = segment.trim();
  if (!source) {
    return source;
  }

  if (!shouldUseKompress(source)) {
    return normalizeShortBody(source);
  }

  const compressText = options.compressionImplementation ?? compressTextWithKompress;
  const result = await compressText(source, {
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.env ? { env: options.env } : {}),
    ...(options.config.kompressPythonBin
      ? { pythonBin: options.config.kompressPythonBin }
      : {}),
    ...(options.config.kompressModelId
      ? { modelId: options.config.kompressModelId }
      : {}),
    ...(options.config.requestTimeout
      ? { requestTimeoutMs: options.config.requestTimeout }
      : {}),
    ...(options.config.kompressStartupTimeout
      ? { startupTimeoutMs: options.config.kompressStartupTimeout }
      : {}),
  });

  let output = normalizeWhitespace(result.compressed);
  output = restoreImperativeCase(source, output);
  output = preserveTerminalPunctuation(source, output);

  return output;
}

function isExactPlaceholder(text: string): boolean {
  return /^__PH_\d{4}__$/.test(text);
}

async function compressBody(
  body: string,
  options: CompressPromptOptions,
): Promise<string> {
  const source = body.trim();
  if (!source) {
    return source;
  }

  const parts = source.split(/(__PH_\d{4}__)/g);

  if (parts.length === 1) {
    return await compressNaturalLanguageSegment(source, options);
  }

  let output = "";

  for (const part of parts) {
    if (!part) {
      continue;
    }

    if (isExactPlaceholder(part)) {
      output += part;
      continue;
    }

    const leadingWhitespace = part.match(/^\s*/)?.[0] ?? "";
    const trailingWhitespace = part.match(/\s*$/)?.[0] ?? "";
    const core = part.trim();

    if (!core) {
      output += part;
      continue;
    }

    const compressedSegment = await compressNaturalLanguageSegment(core, options);
    output += `${leadingWhitespace}${compressedSegment}${trailingWhitespace}`;
  }

  output = normalizeWhitespace(output);
  output = restoreImperativeCase(source, output);
  output = preserveTerminalPunctuation(source, output);

  return output;
}

function splitMarkdownPrefix(line: string): { prefix: string; body: string } {
  const match = line.match(/^(\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+))/);
  if (!match) {
    return { prefix: "", body: line };
  }

  return {
    prefix: match[1] ?? "",
    body: line.slice((match[1] ?? "").length),
  };
}

function extractPlaceholderOrder(text: string): string[] {
  return text.match(PLACEHOLDER_REGEX) ?? [];
}

function hasActionSignal(text: string): boolean {
  return ACTION_STARTER_REGEX.test(text);
}

function isUnsafeCompression(
  sourceMaskedText: string,
  compressedMaskedText: string,
): boolean {
  if (!compressedMaskedText.trim()) {
    return true;
  }

  const sourcePlaceholders = extractPlaceholderOrder(sourceMaskedText);
  const compressedPlaceholders = extractPlaceholderOrder(compressedMaskedText);

  if (sourcePlaceholders.length !== compressedPlaceholders.length) {
    return true;
  }

  if (
    sourcePlaceholders.some(
      (placeholder, index) => placeholder !== compressedPlaceholders[index],
    )
  ) {
    return true;
  }

  if (
    hasActionSignal(sourceMaskedText) &&
    !hasActionSignal(compressedMaskedText)
  ) {
    return true;
  }

  if (
    sourceMaskedText.length >= 32 &&
    compressedMaskedText.length < Math.floor(sourceMaskedText.length * 0.45)
  ) {
    return true;
  }

  return false;
}

function normalizeLiteralText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isMissingCriticalLiteral(
  outputText: string,
  requiredLiterals: readonly string[],
): boolean {
  const normalizedOutput = normalizeLiteralText(outputText);

  return [...new Set(requiredLiterals)]
    .filter(Boolean)
    .some((literal) => !normalizedOutput.includes(normalizeLiteralText(literal)));
}

async function compressMaskedText(
  maskedText: string,
  options: CompressPromptOptions,
): Promise<string> {
  const lines = maskedText.split("\n");

  const compressedLines = await Promise.all(
    lines.map(async (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return "";
      }

      const { prefix, body } = splitMarkdownPrefix(line);
      const compressedBody = await compressBody(body, options);

      return compressedBody ? `${prefix}${compressedBody}` : "";
    }),
  );

  return compressedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildMaskOptions(
  options: CompressPromptOptions,
): MaskProtectedSegmentsOptions {
  return {
    protected_terms: options.policies.protectedTerms,
    preferred_translations: options.policies.preferredTranslations,
    model_names: options.localLlmModelName ? [options.localLlmModelName] : [],
  };
}

export async function compress_prompt(
  normalized_input: string,
  options: CompressPromptOptions,
): Promise<CompressPromptResult> {
  const maskOptions = buildMaskOptions(options);
  const requiredLiterals = collect_preservable_literals(
    normalized_input,
    maskOptions,
  );
  const masked = mask_protected_segments(normalized_input, maskOptions);
  const compressedMaskedText = await compressMaskedText(masked.masked_text, options);

  if (isUnsafeCompression(masked.masked_text, compressedMaskedText)) {
    return {
      compressed_prompt: normalized_input,
      repair_actions: ["compression_fallback_to_normalized_input"],
    };
  }

  const restored = restore_placeholders(
    compressedMaskedText,
    masked.placeholders as PlaceholderEntry[],
  );

  if (isMissingCriticalLiteral(restored, requiredLiterals)) {
    return {
      compressed_prompt: normalized_input,
      repair_actions: ["compression_fallback_to_normalized_input"],
    };
  }

  if (normalizeWhitespace(restored) === normalizeWhitespace(normalized_input)) {
    return {
      compressed_prompt: normalized_input,
      repair_actions: [],
    };
  }

  return {
    compressed_prompt: restored,
    repair_actions: ["compressed_with_kompress"],
  };
}
