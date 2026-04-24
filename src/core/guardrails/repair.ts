import { clean_translation } from "../translate/clean.js";
import type { TranslationGuardrailsRequest } from "./validator.js";

export interface RepairTranslationResult {
  output: string;
  repair_actions: string[];
}

function collectPlaceholders(text: string): string[] {
  return [...text.matchAll(/__PH_\d{4}__/g)].map((match) => match[0]);
}

function normalizePlaceholderOrder(
  sourceText: string,
  outputText: string,
  explicitPlaceholders: readonly string[] = [],
): RepairTranslationResult {
  const expected = explicitPlaceholders.length > 0
    ? [...explicitPlaceholders]
    : collectPlaceholders(sourceText);
  const actual = collectPlaceholders(outputText);

  if (
    expected.length === 0 ||
    expected.length !== actual.length ||
    expected.every((placeholder, index) => placeholder === actual[index])
  ) {
    return {
      output: outputText,
      repair_actions: [],
    };
  }

  let repaired = outputText;
  const temporaryTokens = actual.map(
    (_placeholder, index) => `__TMP_PH_${String(index).padStart(4, "0")}__`,
  );

  actual.forEach((placeholder, index) => {
    repaired = repaired.replace(placeholder, temporaryTokens[index]!);
  });

  expected.forEach((placeholder, index) => {
    repaired = repaired.replace(temporaryTokens[index]!, placeholder);
  });

  return {
    output: repaired,
    repair_actions: ["placeholder_order_restored"],
  };
}

function removeForbiddenPatterns(
  outputText: string,
  forbiddenPatterns: readonly string[] = [],
): RepairTranslationResult {
  let repaired = outputText;
  const repairActions: string[] = [];

  for (const pattern of forbiddenPatterns) {
    try {
      const regex = new RegExp(pattern, "gm");
      if (regex.test(repaired)) {
        repaired = repaired.replace(regex, "").trim();
        repairActions.push(`forbidden_pattern_removed:${pattern}`);
      }
    } catch {
      if (repaired.includes(pattern)) {
        repaired = repaired.replaceAll(pattern, "").trim();
        repairActions.push(`forbidden_pattern_removed:${pattern}`);
      }
    }
  }

  return {
    output: repaired,
    repair_actions: repairActions,
  };
}

export function repair_translation(
  request: TranslationGuardrailsRequest,
): RepairTranslationResult {
  let output = clean_translation(request.source_text, request.compressed_prompt);
  const repairActions = output === request.compressed_prompt
    ? []
    : ["clean_translation_applied"];

  const ordered = normalizePlaceholderOrder(
    request.source_text,
    output,
    request.placeholders,
  );
  output = ordered.output;
  repairActions.push(...ordered.repair_actions);

  const cleanedForbidden = removeForbiddenPatterns(
    output,
    request.forbidden_patterns,
  );
  output = cleanedForbidden.output;
  repairActions.push(...cleanedForbidden.repair_actions);

  const cleanedAgain = clean_translation(request.source_text, output);
  if (cleanedAgain !== output) {
    output = cleanedAgain;
    repairActions.push("clean_translation_applied");
  }

  return {
    output,
    repair_actions: repairActions,
  };
}
