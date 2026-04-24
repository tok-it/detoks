export interface TranslationGuardrailsRequest {
  source_text: string;
  compressed_prompt: string;
  placeholders?: string[];
  protected_terms?: string[];
  required_terms?: string[];
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
