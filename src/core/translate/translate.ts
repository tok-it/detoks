import { complete_chat, type LlmCompletionResponse } from "../llm-client/client.js";
import type {
  Role1Policies,
  Role1RuntimeConfig,
} from "../prompt/config.js";
import {
  mask_protected_segments,
  restore_placeholders,
  type PlaceholderEntry,
} from "./masking.js";
import {
  extract_translatable_spans,
  reassemble_spans,
  type TranslatableSpan,
} from "./spans.js";
import { clean_translation } from "./clean.js";
import { repair_translation } from "../guardrails/repair.js";
import { validate_translation } from "../guardrails/validator.js";

export interface TranslateToEnglishOptions {
  config: Role1RuntimeConfig;
  policies: Role1Policies;
  fetchImplementation?: typeof fetch;
}

export interface TranslateToEnglishResult {
  text: string;
  masked_text: string;
  placeholders: PlaceholderEntry[];
  spans: TranslatableSpan[];
  raw_responses: Record<string, unknown>[];
  inference_time_sec: number;
  fallback_span_count: number;
  span_results: TranslationSpanResult[];
}

export interface TranslationSpanResult {
  source_text: string;
  output_text: string;
  status: "skipped" | "translated" | "fallback_succeeded" | "failed";
  attempts: number;
  validation_errors: string[];
  repair_actions: string[];
}

const TRANSLATION_SYSTEM_PROMPT = [
  "Translate Korean user input into concise English.",
  "Preserve placeholders exactly as written.",
  "Do not add explanations, labels, numbering, or code fences.",
  "Keep commands, paths, JSON keys, URLs, emails, and model names unchanged.",
].join(" ");

function containsKorean(text: string): boolean {
  return /[가-힣]/.test(text);
}

async function translate_span(
  span: TranslatableSpan,
  options: TranslateToEnglishOptions,
  promptType: "primary" | "fallback" = "primary",
): Promise<LlmCompletionResponse | null> {
  if (!span.translate || !containsKorean(span.text)) {
    return null;
  }

  return complete_chat(
    {
      messages: [
        {
          role: "system",
          content:
            promptType === "fallback"
              ? `${TRANSLATION_SYSTEM_PROMPT} Return only the corrected English translation. Preserve placeholder count and order exactly.`
              : TRANSLATION_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: span.text,
        },
      ],
      temperature: options.config.temperature,
      timeout_ms: options.config.requestTimeout,
    },
    {
      ...(options.config.openaiApiBase
        ? { apiBase: options.config.openaiApiBase }
        : {}),
      ...(options.config.openaiApiKey
        ? { apiKey: options.config.openaiApiKey }
        : {}),
      ...(options.config.modelName
        ? { modelName: options.config.modelName }
        : {}),
      ...(options.fetchImplementation
        ? { fetchImplementation: options.fetchImplementation }
        : {}),
    },
  );
}

export async function translate_to_english(
  source_text: string,
  options: TranslateToEnglishOptions,
): Promise<TranslateToEnglishResult> {
  const masked = mask_protected_segments(source_text, {
    protected_terms: options.policies.protectedTerms,
    preferred_translations: options.policies.preferredTranslations,
    model_names: options.config.modelName ? [options.config.modelName] : [],
  });
  const spans = extract_translatable_spans(masked.masked_text, masked.placeholders);
  const translatedSpans: TranslatableSpan[] = [];
  const rawResponses: Record<string, unknown>[] = [];
  let inferenceTimeSec = 0;
  let fallbackSpanCount = 0;
  const spanResults: TranslationSpanResult[] = [];

  for (const span of spans) {
    const llmResponse = await translate_span(span, options);
    if (!llmResponse) {
      translatedSpans.push(span);
      spanResults.push({
        source_text: span.text,
        output_text: span.text,
        status: "skipped",
        attempts: 0,
        validation_errors: [],
        repair_actions: [],
      });
      continue;
    }

    const cleaned = clean_translation(span.text, llmResponse.content);
    if (llmResponse.raw_response) {
      rawResponses.push(llmResponse.raw_response);
    }
    inferenceTimeSec += llmResponse.inference_time_sec ?? 0;

    const placeholderTokens = masked.placeholders
      .filter((entry) => span.text.includes(entry.placeholder))
      .map((entry) => entry.placeholder);
    const requiredTerms = Object.keys(options.policies.preferredTranslations)
      .filter((term) => span.text.includes(term))
      .map((term) => options.policies.preferredTranslations[term]!)
      .filter(Boolean);
    const initialValidation = validate_translation({
      source_text: span.text,
      compressed_prompt: cleaned,
      placeholders: placeholderTokens,
      protected_terms: options.policies.protectedTerms,
      required_terms: requiredTerms,
      forbidden_patterns: options.policies.forbiddenPatterns,
    });
    const repaired = repair_translation({
      source_text: span.text,
      compressed_prompt: initialValidation.output,
      placeholders: placeholderTokens,
      protected_terms: options.policies.protectedTerms,
      required_terms: requiredTerms,
      forbidden_patterns: options.policies.forbiddenPatterns,
    });
    const repairedValidation = validate_translation({
      source_text: span.text,
      compressed_prompt: repaired.output,
      placeholders: placeholderTokens,
      protected_terms: options.policies.protectedTerms,
      required_terms: requiredTerms,
      forbidden_patterns: options.policies.forbiddenPatterns,
    });

    let finalText = repaired.output;
    let status: TranslationSpanResult["status"] = "translated";
    let attempts = 1;
    let validationErrors = repairedValidation.validation_errors;
    const repairActions = repaired.repair_actions;

    if (validationErrors.length > 0 && attempts < options.config.translationMaxAttempts) {
      const fallbackResponse = await translate_span(span, options, "fallback");
      attempts += 1;

      if (fallbackResponse) {
        fallbackSpanCount += 1;
        const fallbackCleaned = clean_translation(span.text, fallbackResponse.content);
        if (fallbackResponse.raw_response) {
          rawResponses.push(fallbackResponse.raw_response);
        }
        inferenceTimeSec += fallbackResponse.inference_time_sec ?? 0;

        const fallbackValidation = validate_translation({
          source_text: span.text,
          compressed_prompt: fallbackCleaned,
          placeholders: placeholderTokens,
          protected_terms: options.policies.protectedTerms,
          required_terms: requiredTerms,
          forbidden_patterns: options.policies.forbiddenPatterns,
        });

        if (fallbackValidation.validation_errors.length === 0) {
          finalText = fallbackCleaned;
          validationErrors = [];
          status = "fallback_succeeded";
        } else {
          status = "failed";
          validationErrors = fallbackValidation.validation_errors;
          finalText = repaired.output;
        }
      } else {
        status = "failed";
      }
    } else if (validationErrors.length > 0) {
      status = "failed";
    }

    translatedSpans.push({
      ...span,
      text: finalText,
    });
    spanResults.push({
      source_text: span.text,
      output_text: finalText,
      status,
      attempts,
      validation_errors: validationErrors,
      repair_actions: repairActions,
    });
  }

  const restoredText = restore_placeholders(
    reassemble_spans(translatedSpans),
    masked.placeholders,
  );

  return {
    text: restoredText,
    masked_text: masked.masked_text,
    placeholders: masked.placeholders,
    spans: translatedSpans,
    raw_responses: rawResponses,
    inference_time_sec: inferenceTimeSec,
    fallback_span_count: fallbackSpanCount,
    span_results: spanResults,
  };
}
