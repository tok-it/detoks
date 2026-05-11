export type ProtectedSegmentKind =
  | "code_block"
  | "inline_code"
  | "url"
  | "email"
  | "json_key"
  | "function_call"
  | "qualified_identifier"
  | "slash_token"
  | "quoted_literal"
  | "filename"
  | "directory_path"
  | "model_name"
  | "snake_identifier"
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

export interface PlaceholderClusterEntry {
  placeholder: string;
  original: string;
  placeholders: string[];
}

export interface ClusterPlaceholderSequencesResult {
  masked_text: string;
  clusters: PlaceholderClusterEntry[];
}

interface MatchCandidate {
  start: number;
  end: number;
  original: string;
  kind: ProtectedSegmentKind;
  priority: number;
}

function hasKorean(text: string): boolean {
  return /[가-힣]/.test(text);
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
    kind: "function_call",
    priority: 74,
    regex: /\b[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*\([^()\n]*\)/g,
  },
  {
    kind: "qualified_identifier",
    priority: 73,
    regex: /\b[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*){1,}\b/g,
  },
  {
    kind: "slash_token",
    priority: 72,
    regex: /[A-Za-z0-9가-힣._+-]+\/[A-Za-z0-9가-힣._+-]+/g,
  },
  {
    kind: "quoted_literal",
    priority: 71,
    regex: /"(?:[^"\\\n]|\\.)+"|'(?:[^'\\\n]|\\.)+'/g,
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
    kind: "snake_identifier",
    priority: 56,
    regex: /\b[A-Za-z]+_[A-Za-z0-9_]+\b/g,
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

function createClusterPlaceholder(index: number): string {
  return `__PHC_${String(index).padStart(4, "0")}__`;
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

    if (
      (kind === "function_call" ||
        kind === "slash_token" ||
        kind === "directory_path") &&
      hasKorean(original)
    ) {
      continue;
    }

    if (kind === "quoted_literal" && !isTechnicalQuotedLiteral(original)) {
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

function isTechnicalQuotedLiteral(literal: string): boolean {
  const inner = literal.slice(1, -1).trim();

  if (!inner || hasKorean(inner)) {
    return false;
  }

  if (/[\\/._:-]/.test(inner) || /\d/.test(inner)) {
    return true;
  }

  if (/\b[A-Z]{2,}\b/.test(inner)) {
    return true;
  }

  if (/\b[A-Za-z]+_[A-Za-z0-9_]+\b/.test(inner)) {
    return true;
  }

  return false;
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

function selectCandidates(
  candidates: readonly MatchCandidate[],
): MatchCandidate[] {
  const selected: MatchCandidate[] = [];
  let cursor = 0;

  for (const candidate of candidates) {
    if (candidate.start < cursor) {
      continue;
    }

    selected.push(candidate);
    cursor = candidate.end;
  }

  return selected;
}

export function collect_preservable_literals(
  source_text: string,
  options: MaskProtectedSegmentsOptions = {},
): string[] {
  const selected = selectCandidates(collectCandidates(source_text, options));
  const literals = selected
    .map((candidate) => candidate.original)
    .filter((literal) => literal && !/^__PH(?:C)?_\d{4}__$/.test(literal));

  return [...new Set(literals)];
}

export function mask_protected_segments(
  source_text: string,
  options: MaskProtectedSegmentsOptions = {},
): MaskProtectedSegmentsResult {
  const candidates = selectCandidates(collectCandidates(source_text, options));
  const placeholders: PlaceholderEntry[] = [];
  let cursor = 0;
  let maskedText = "";

  for (const candidate of candidates) {
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

function isClusterSeparator(text: string): boolean {
  return /^[\s()[\]{}<>,.:;|/\\+-]*$/.test(text);
}

export function cluster_placeholder_sequences(
  masked_text: string,
): ClusterPlaceholderSequencesResult {
  const placeholderMatches = [...masked_text.matchAll(/__PH_\d{4}__/g)];

  if (placeholderMatches.length < 2) {
    return {
      masked_text,
      clusters: [],
    };
  }

  const clusters: PlaceholderClusterEntry[] = [];
  let clusteredText = "";
  let cursor = 0;
  let index = 0;

  while (index < placeholderMatches.length) {
    const groupStart = placeholderMatches[index]!.index;

    if (groupStart === undefined) {
      index += 1;
      continue;
    }

    let nextIndex = index + 1;
    let groupEnd = groupStart + placeholderMatches[index]![0].length;

    while (nextIndex < placeholderMatches.length) {
      const nextMatch = placeholderMatches[nextIndex]!;
      const nextStart = nextMatch.index;

      if (nextStart === undefined) {
        break;
      }

      const separator = masked_text.slice(groupEnd, nextStart);
      if (!isClusterSeparator(separator)) {
        break;
      }

      groupEnd = nextStart + nextMatch[0].length;
      nextIndex += 1;
    }

    if (nextIndex - index < 2) {
      index += 1;
      continue;
    }

    const placeholder = createClusterPlaceholder(clusters.length + 1);
    clusteredText += masked_text.slice(cursor, groupStart);
    clusteredText += placeholder;
    clusters.push({
      placeholder,
      original: masked_text.slice(groupStart, groupEnd),
      placeholders: placeholderMatches
        .slice(index, nextIndex)
        .map((match) => match[0]),
    });
    cursor = groupEnd;
    index = nextIndex;
  }

  if (clusters.length === 0) {
    return {
      masked_text,
      clusters,
    };
  }

  clusteredText += masked_text.slice(cursor);

  return {
    masked_text: clusteredText,
    clusters,
  };
}

export function expand_placeholder_clusters(
  masked_text: string,
  clusters: readonly PlaceholderClusterEntry[],
): string {
  return clusters.reduce((restored, cluster) => {
    return restored.replaceAll(cluster.placeholder, cluster.original);
  }, masked_text);
}
