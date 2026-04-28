import { collect_preservable_literals } from "../translate/masking.js";

export interface TranslationGuardrailsRequest {
  source_text: string;
  compressed_prompt: string;
  placeholders?: string[];
  protected_terms?: string[];
  required_terms?: string[];
  required_literals?: string[];
  model_names?: string[];
  forbidden_patterns?: string[];
}

export interface TranslationGuardrailsResponse {
  output: string;
  validation_errors: string[];
  repair_actions: string[];
}

function collectPlaceholders(text: string): string[] {
  return [...text.matchAll(/__PH_\d{4}__/g)].map((match) => match[0]);
}

function hasKorean(text: string): boolean {
  return /[가-힣]/.test(text);
}

function includesCopiedKorean(sourceText: string, outputText: string): boolean {
  if (!hasKorean(sourceText) || !hasKorean(outputText)) {
    return false;
  }

  const koreanTokens = sourceText.match(/[가-힣]{2,}/g) ?? [];
  return koreanTokens.some((token) => outputText.includes(token));
}

function validatePlaceholderSequence(
  sourceText: string,
  outputText: string,
  explicitPlaceholders: readonly string[] = [],
): string[] {
  const expected = explicitPlaceholders.length > 0
    ? [...explicitPlaceholders]
    : collectPlaceholders(sourceText);
  const actual = collectPlaceholders(outputText);
  const errors: string[] = [];

  if (expected.length !== actual.length) {
    errors.push("placeholder_count_mismatch");
  }

  if (
    expected.length === actual.length &&
    expected.some((placeholder, index) => placeholder !== actual[index])
  ) {
    errors.push("placeholder_order_mismatch");
  }

  return errors;
}

function validateForbiddenPatterns(
  outputText: string,
  forbiddenPatterns: readonly string[] = [],
): string[] {
  const errors: string[] = [];

  for (const pattern of forbiddenPatterns) {
    try {
      if (new RegExp(pattern, "m").test(outputText)) {
        errors.push(`forbidden_pattern:${pattern}`);
      }
    } catch {
      if (outputText.includes(pattern)) {
        errors.push(`forbidden_pattern:${pattern}`);
      }
    }
  }

  return errors;
}

function validateRequiredTerms(
  outputText: string,
  requiredTerms: readonly string[] = [],
): string[] {
  return requiredTerms
    .filter((term) => term && !outputText.includes(term))
    .map((term) => `required_term_missing:${term}`);
}

function normalizeInlineWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function isHighConfidenceInferredLiteral(literal: string): boolean {
  const normalized = normalizeInlineWhitespace(literal);

  if (!normalized || hasKorean(normalized)) {
    return false;
  }

  if (/\b[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*\([^()\n]*\)/.test(normalized)) {
    return true;
  }

  if (/\b[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)+\b/.test(normalized)) {
    return true;
  }

  if (/\b[A-Za-z]+_[A-Za-z0-9_]+\b/.test(normalized)) {
    return true;
  }

  if (/[\\/]/.test(normalized)) {
    return true;
  }

  if (/[`'"]/.test(normalized)) {
    return true;
  }

  return false;
}

export function findMissingRequiredLiterals(
  outputText: string,
  requiredLiterals: readonly string[] = [],
): string[] {
  const normalizedOutput = normalizeInlineWhitespace(outputText);

  return [...new Set(requiredLiterals)]
    .filter(Boolean)
    .filter((literal) => !normalizedOutput.includes(normalizeInlineWhitespace(literal)));
}

function validateRequiredLiterals(
  outputText: string,
  requiredLiterals: readonly string[] = [],
): string[] {
  return findMissingRequiredLiterals(outputText, requiredLiterals)
    .map((literal) => `required_literal_missing:${literal}`);
}

function validateLengthDelta(
  sourceText: string,
  outputText: string,
): string[] {
  if (!sourceText.trim() || !outputText.trim()) {
    return [];
  }

  const ratio = outputText.length / Math.max(sourceText.length, 1);
  if (ratio > 3 || ratio < 0.2) {
    return ["length_ratio_out_of_bounds"];
  }

  return [];
}

export function validate_translation(
  request: TranslationGuardrailsRequest,
): TranslationGuardrailsResponse {
  const inferredRequiredLiterals = collect_preservable_literals(
    request.source_text,
    {
      ...(request.protected_terms
        ? { protected_terms: request.protected_terms }
        : {}),
      ...(request.model_names
        ? { model_names: request.model_names }
        : {}),
    },
  ).filter(isHighConfidenceInferredLiteral);
  const validationErrors = [
    ...validatePlaceholderSequence(
      request.source_text,
      request.compressed_prompt,
      request.placeholders,
    ),
    ...validateForbiddenPatterns(
      request.compressed_prompt,
      request.forbidden_patterns,
    ),
    ...validateRequiredTerms(
      request.compressed_prompt,
      request.required_terms,
    ),
    ...validateRequiredLiterals(
      request.compressed_prompt,
      [...inferredRequiredLiterals, ...(request.required_literals ?? [])],
    ),
    ...validateLengthDelta(request.source_text, request.compressed_prompt),
  ];

  if (hasKorean(request.compressed_prompt)) {
    validationErrors.push("korean_text_remaining");
  }

  if (includesCopiedKorean(request.source_text, request.compressed_prompt)) {
    validationErrors.push("source_korean_copied");
  }

  return {
    output: request.compressed_prompt,
    validation_errors: [...new Set(validationErrors)],
    repair_actions: [],
  };
}

export interface AdapterOutputWarning {
  code: string;
  detail?: string;
}

/**
 * adapter rawOutput에 대한 기본 출력 품질 검증.
 * 번역/압축 guardrails와 달리 실행 직후 품질 신호를 탐지하는 경량 체크.
 */
export function validate_adapter_output(rawOutput: string): AdapterOutputWarning[] {
  const warnings: AdapterOutputWarning[] = [];
  const trimmed = rawOutput.trim();

  if (!trimmed) {
    warnings.push({ code: "empty_output" });
    return warnings;
  }

  // 에러 패턴 감지
  if (/^(Error|Exception|Traceback|Fatal|FATAL|error:)/m.test(trimmed)) {
    warnings.push({ code: "error_pattern_detected" });
  }

  // 응답 미완성 감지: 문장 중간에 잘린 신호
  if (/\.\.\.\s*$/.test(trimmed) && trimmed.length > 30) {
    warnings.push({ code: "possible_truncation" });
  }

  // 매우 짧은 출력 (실질적 내용 없음)
  if (trimmed.length < 10 && !/^(ok|yes|no|done|true|false)$/i.test(trimmed)) {
    warnings.push({ code: "suspiciously_short_output", detail: `length=${trimmed.length}` });
  }

  return warnings;
}
