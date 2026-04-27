import type { Role1Policies } from "./config.js";
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
  [/\bjust\b/gi, ""],
  [/\b(?:basically|actually)\b/gi, ""],
  [/\s{2,}/g, " "],
];

const ACTION_STARTER_REGEX =
  /\b(find|locate|trace|follow|show|read|search|explore|inspect|analyze|investigate|explain|review|compare|assess|evaluate|create|build|generate|scaffold|implement|add|make|modify|update|change|fix|patch|edit|refactor|rename|rewrite|remove|replace|improve|optimi[sz]e|tune|correct|test|validate|verify|confirm|ensure|lint|typecheck|run|execute|deploy|start|launch|restart|stop|install|migrate|seed|serve|document|summari[sz]e|describe|write|prepare|plan|design|outline|propose|check)\b/i;

const PLACEHOLDER_REGEX = /__PH_\d{4}__/g;
const SENTENCE_SPLIT_REGEX = /(?<=[.!?])\s+/;

export interface CompressPromptOptions {
  policies: Role1Policies;
  modelName?: string;
}

export interface CompressPromptResult {
  compressed_prompt: string;
  repair_actions: string[];
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripLeadingFillers(text: string): string {
  let output = text.trim();

  for (const pattern of LEADING_FILLER_PATTERNS) {
    output = output.replace(pattern, "");
  }

  return output.trim();
}

function stripInlineFillers(text: string): string {
  return INLINE_FILLER_PATTERNS.reduce((output, [pattern, replacement]) => {
    return output.replace(pattern, replacement);
  }, text);
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

function dedupeSentences(text: string): string {
  const seen = new Set<string>();
  const sentences = text
    .split(SENTENCE_SPLIT_REGEX)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const deduped = sentences.filter((sentence) => {
    const key = sentence
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });

  return deduped.join(" ");
}

function compressBody(body: string): string {
  const source = body.trim();
  if (!source) {
    return source;
  }

  let output = stripLeadingFillers(source);
  output = stripInlineFillers(output);
  output = dedupeSentences(output);
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

function compressMaskedText(maskedText: string): string {
  const lines = maskedText.split("\n");

  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return "";
      }

      const { prefix, body } = splitMarkdownPrefix(line);
      const compressedBody = compressBody(body);

      return compressedBody ? `${prefix}${compressedBody}` : "";
    })
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
    model_names: options.modelName ? [options.modelName] : [],
  };
}

export function compress_prompt(
  normalized_input: string,
  options: CompressPromptOptions,
): CompressPromptResult {
  const maskOptions = buildMaskOptions(options);
  const requiredLiterals = collect_preservable_literals(
    normalized_input,
    maskOptions,
  );
  const masked = mask_protected_segments(normalized_input, maskOptions);
  const compressedMaskedText = compressMaskedText(masked.masked_text);

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
    repair_actions: ["compressed_with_nlp_adapter"],
  };
}
