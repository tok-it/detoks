const PREAMBLE_PARAGRAPH_PATTERNS: readonly RegExp[] = [
  /^(?:Okay|Ok|Alright|Sure|Of course|Got it|Understood|Certainly|Right)\b[\s\S]{0,400}?[.:!\n]/i,
  /^Here(?:'s| is)\s+(?:the\s+)?(?:translation|English|translated|corrected)\b[\s\S]{0,200}?[:\n]/i,
  /^Let me\s+(?:translate|provide|help|adhere|preserve)\b[\s\S]{0,200}?[.:\n]/i,
  /^I(?:'ll| will| can|'m going to|'m)\s+(?:translate|provide|adhere|preserve|output|return)\b[\s\S]{0,200}?[.:\n]/i,
  /^The user\s+(?:wants|is asking|asked|wonders|wants to know|is wondering)\b[\s\S]{0,400}?[.:\n]/i,
  /^(?:Translation|Translated text|English translation|English|Note|System)\s*:\s*\n/i,
];

const PREAMBLE_LINE_PATTERNS: readonly RegExp[] = [
  /^>\s*(?:Note|System|Translation|Translated text|English)\s*:\s*.*$/i,
  /^(?:#+\s*)?(?:Translation|Translated text|English translation)\s*:?\s*$/i,
];

function hasKorean(text: string): boolean {
  return /[가-힣]/.test(text);
}

function stripLeadingPreamble(text: string): string {
  let cursor = text;
  let guard = 4;

  while (guard-- > 0) {
    const trimmed = cursor.replace(/^\s+/, "");
    if (!trimmed) {
      return cursor;
    }

    const paragraphMatch = trimmed.match(/^([\s\S]*?)(\n\s*\n|$)/);
    const firstParagraph = paragraphMatch?.[1] ?? trimmed;
    const separator = paragraphMatch?.[2] ?? "";

    const paragraphMatches = PREAMBLE_PARAGRAPH_PATTERNS.some((pattern) =>
      pattern.test(firstParagraph),
    );

    if (paragraphMatches) {
      const remainder = trimmed.slice(firstParagraph.length + separator.length);
      if (!remainder.trim() || hasKorean(remainder)) {
        return cursor;
      }
      cursor = remainder;
      continue;
    }

    const lineMatch = trimmed.match(/^([^\n]*)(\n|$)/);
    const firstLine = lineMatch?.[1] ?? trimmed;
    const lineMatches = PREAMBLE_LINE_PATTERNS.some((pattern) =>
      pattern.test(firstLine.trim()),
    );

    if (lineMatches) {
      const remainder = trimmed.slice((lineMatch?.[0] ?? firstLine).length);
      if (!remainder.trim() || hasKorean(remainder)) {
        return cursor;
      }
      cursor = remainder;
      continue;
    }

    return trimmed;
  }

  return cursor;
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

  cleaned = stripLeadingPreamble(cleaned).trim();

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
