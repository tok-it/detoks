export type ProtectedSegmentKind =
  | "code_block"
  | "inline_code"
  | "url"
  | "email"
  | "json_key"
  | "filename"
  | "directory_path"
  | "model_name"
  | "numeric_token"
  | "uppercase_abbreviation"
  | "protected_term"
  | "preferred_translation";

export interface PlaceholderEntry {
  placeholder: string;
  original: string;
  kind: ProtectedSegmentKind;
}

export interface MaskProtectedSegmentsOptions {
  protected_terms?: string[];
  preferred_translations?: Record<string, string>;
  model_names?: string[];
}

export interface MaskProtectedSegmentsResult {
  masked_text: string;
  placeholders: PlaceholderEntry[];
}

interface MatchCandidate {
  start: number;
  end: number;
  original: string;
  kind: ProtectedSegmentKind;
  priority: number;
}

const PATTERN_SPECS: ReadonlyArray<{
  kind: Exclude<
    ProtectedSegmentKind,
    "protected_term" | "preferred_translation"
  >;
  priority: number;
  regex: RegExp;
}> = [
  {
    kind: "code_block",
    priority: 100,
    regex: /```[\s\S]*?```/g,
  },
  {
    kind: "inline_code",
    priority: 90,
    regex: /`[^`\n]+`/g,
  },
  {
    kind: "url",
    priority: 80,
    regex: /\bhttps?:\/\/[^\s<>()]+/g,
  },
  {
    kind: "email",
    priority: 80,
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    kind: "json_key",
    priority: 75,
    regex: /"[^"\n]+"(?=\s*:)/g,
  },
  {
    kind: "directory_path",
    priority: 70,
    regex: /(?:\.\.?\/|\/)[^\s`"'|]+|\b[\w.-]+(?:\/[\w.-]+){1,}\b/g,
  },
  {
    kind: "model_name",
    priority: 65,
    regex: /\b(?:GPT|Claude|Gemini|Llama|gpt|claude|gemini|llama)[A-Za-z0-9._-]*\b/g,
  },
  {
    kind: "filename",
    priority: 60,
    regex: /\b[\w.-]+\.[A-Za-z0-9]{1,8}\b/g,
  },
  {
    kind: "numeric_token",
    priority: 55,
    regex: /\b[A-Za-z_-]*\d[\w.-]*\b/g,
  },
  {
    kind: "uppercase_abbreviation",
    priority: 50,
    regex: /\b[A-Z]{2,}(?:\.[A-Z]{2,})*\b/g,
  },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createPlaceholder(index: number): string {
  return `__PH_${String(index).padStart(4, "0")}__`;
}

function addRegexCandidates(
  candidates: MatchCandidate[],
  sourceText: string,
  kind: MatchCandidate["kind"],
  priority: number,
  regex: RegExp,
): void {
  const matches = sourceText.matchAll(regex);

  for (const match of matches) {
    const original = match[0];
    const start = match.index;

    if (start === undefined || !original) {
      continue;
    }

    candidates.push({
      start,
      end: start + original.length,
      original,
      kind,
      priority,
    });
  }
}

function addLiteralCandidates(
  candidates: MatchCandidate[],
  sourceText: string,
  values: readonly string[],
  kind: "protected_term" | "preferred_translation",
  priority: number,
): void {
  const uniqueValues = [...new Set(values)]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  for (const value of uniqueValues) {
    const regex = new RegExp(escapeRegExp(value), "g");
    addRegexCandidates(candidates, sourceText, kind, priority, regex);
  }
}

function collectCandidates(
  sourceText: string,
  options: MaskProtectedSegmentsOptions,
): MatchCandidate[] {
  const candidates: MatchCandidate[] = [];

  for (const spec of PATTERN_SPECS) {
    addRegexCandidates(
      candidates,
      sourceText,
      spec.kind,
      spec.priority,
      spec.regex,
    );
  }

  addLiteralCandidates(
    candidates,
    sourceText,
    options.model_names ?? [],
    "protected_term",
    85,
  );
  addLiteralCandidates(
    candidates,
    sourceText,
    options.protected_terms ?? [],
    "protected_term",
    84,
  );
  addLiteralCandidates(
    candidates,
    sourceText,
    Object.keys(options.preferred_translations ?? {}),
    "preferred_translation",
    83,
  );

  return candidates.sort((left, right) => {
    if (left.start !== right.start) {
      return left.start - right.start;
    }

    if (left.priority !== right.priority) {
      return right.priority - left.priority;
    }

    return right.original.length - left.original.length;
  });
}

export function mask_protected_segments(
  source_text: string,
  options: MaskProtectedSegmentsOptions = {},
): MaskProtectedSegmentsResult {
  const candidates = collectCandidates(source_text, options);
  const placeholders: PlaceholderEntry[] = [];
  let cursor = 0;
  let maskedText = "";

  for (const candidate of candidates) {
    if (candidate.start < cursor) {
      continue;
    }

    const placeholder = createPlaceholder(placeholders.length + 1);
    maskedText += source_text.slice(cursor, candidate.start);
    maskedText += placeholder;
    placeholders.push({
      placeholder,
      original: candidate.original,
      kind: candidate.kind,
    });
    cursor = candidate.end;
  }

  maskedText += source_text.slice(cursor);

  return {
    masked_text: maskedText,
    placeholders,
  };
}

export function restore_placeholders(
  masked_text: string,
  placeholders: readonly PlaceholderEntry[],
): string {
  return placeholders.reduce((restored, entry) => {
    return restored.replaceAll(entry.placeholder, entry.original);
  }, masked_text);
}
