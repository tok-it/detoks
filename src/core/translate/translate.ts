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

export function clean_translation(
  source_text: string,
  translated_text: string,
): string {
  let cleaned = translated_text.trim();

  const codeFenceMatch = cleaned.match(/^```[A-Za-z0-9_-]*\n([\s\S]*?)\n```$/);
  if (codeFenceMatch) {
    cleaned = codeFenceMatch[1]!.trim();
  }

  cleaned = cleaned.replace(
    /^(?:translation|translated text|english translation|english)\s*:\s*/i,
    "",
  );

  if (
    !/^["'].*["']$/s.test(source_text.trim()) &&
    ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'")))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  if (!/^\s*\d+[.)]\s+/.test(source_text)) {
    cleaned = cleaned.replace(/^\s*\d+[.)]\s+/, "");
  }

  return cleaned.trim();
}

async function translate_span(
  span: TranslatableSpan,
  options: TranslateToEnglishOptions,
): Promise<LlmCompletionResponse | null> {
  if (!span.translate || !containsKorean(span.text)) {
    return null;
  }

  return complete_chat(
    {
      messages: [
        {
          role: "system",
          content: TRANSLATION_SYSTEM_PROMPT,
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

  for (const span of spans) {
    const llmResponse = await translate_span(span, options);
    if (!llmResponse) {
      translatedSpans.push(span);
      continue;
    }

    translatedSpans.push({
      ...span,
      text: clean_translation(span.text, llmResponse.content),
    });

    if (llmResponse.raw_response) {
      rawResponses.push(llmResponse.raw_response);
    }
    inferenceTimeSec += llmResponse.inference_time_sec ?? 0;
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
  };
}
