import type { PlaceholderEntry } from "./masking.js";

export type TranslatableSpanKind =
  | "blank_line"
  | "heading"
  | "bullet"
  | "numbered_item"
  | "paragraph"
  | "table_row"
  | "code_block";

export interface TranslatableSpan {
  kind: TranslatableSpanKind;
  text: string;
  translate: boolean;
}

function isBlankLine(line: string): boolean {
  return line.trim() === "";
}

function isHeading(line: string): boolean {
  return /^\s{0,3}#{1,6}\s+/.test(line);
}

function isBullet(line: string): boolean {
  return /^\s*[-*+]\s+/.test(line);
}

function isNumberedItem(line: string): boolean {
  return /^\s*\d+[.)]\s+/.test(line);
}

function isTableRow(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line);
}

function isCodeFence(line: string): boolean {
  return /^\s*```/.test(line);
}

function isPlaceholderOnlyText(text: string): boolean {
  const normalized = text
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/^\s*\d+[.)]\s+/, "")
    .replace(/\|/g, " ")
    .trim();

  if (!normalized) {
    return false;
  }

  const residue = normalized
    .replace(/__PH_\d{4}__/g, "")
    .replace(/[ \t`*_~:#>|()[\]{}\-.,!?/\\]+/g, "")
    .trim();

  return residue === "";
}

function findPlaceholderKinds(
  text: string,
  placeholdersByToken: ReadonlyMap<string, PlaceholderEntry>,
): Set<PlaceholderEntry["kind"]> {
  const kinds = new Set<PlaceholderEntry["kind"]>();

  for (const match of text.matchAll(/__PH_\d{4}__/g)) {
    const placeholder = match[0];
    const entry = placeholdersByToken.get(placeholder);
    if (entry) {
      kinds.add(entry.kind);
    }
  }

  return kinds;
}

function createSpan(
  kind: TranslatableSpanKind,
  text: string,
  placeholdersByToken: ReadonlyMap<string, PlaceholderEntry>,
): TranslatableSpan {
  const placeholderKinds = findPlaceholderKinds(text, placeholdersByToken);
  const resolvedKind =
    kind === "paragraph" &&
    placeholderKinds.size === 1 &&
    placeholderKinds.has("code_block") &&
    isPlaceholderOnlyText(text)
      ? "code_block"
      : kind;

  return {
    kind: resolvedKind,
    text,
    translate:
      resolvedKind !== "blank_line" &&
      resolvedKind !== "code_block" &&
      !isPlaceholderOnlyText(text),
  };
}

export function extract_translatable_spans(
  masked_text: string,
  placeholders: readonly PlaceholderEntry[] = [],
): TranslatableSpan[] {
  const normalized = masked_text.replace(/\r\n?/g, "\n");
  if (!normalized) {
    return [];
  }

  const lines = normalized.split("\n");
  const spans: TranslatableSpan[] = [];
  const placeholdersByToken = new Map(
    placeholders.map((entry) => [entry.placeholder, entry]),
  );
  let paragraphLines: string[] = [];

  const flushParagraph = (): void => {
    if (paragraphLines.length === 0) {
      return;
    }

    spans.push(
      createSpan("paragraph", paragraphLines.join("\n"), placeholdersByToken),
    );
    paragraphLines = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    if (isCodeFence(line)) {
      flushParagraph();
      const codeBlockLines = [line];
      let cursor = index + 1;

      while (cursor < lines.length) {
        codeBlockLines.push(lines[cursor] ?? "");
        if (isCodeFence(lines[cursor] ?? "")) {
          break;
        }
        cursor += 1;
      }

      spans.push(
        createSpan("code_block", codeBlockLines.join("\n"), placeholdersByToken),
      );
      index = cursor;
      continue;
    }

    if (isBlankLine(line)) {
      flushParagraph();
      spans.push(createSpan("blank_line", "", placeholdersByToken));
      continue;
    }

    if (isHeading(line)) {
      flushParagraph();
      spans.push(createSpan("heading", line, placeholdersByToken));
      continue;
    }

    if (isBullet(line)) {
      flushParagraph();
      spans.push(createSpan("bullet", line, placeholdersByToken));
      continue;
    }

    if (isNumberedItem(line)) {
      flushParagraph();
      spans.push(createSpan("numbered_item", line, placeholdersByToken));
      continue;
    }

    if (isTableRow(line)) {
      flushParagraph();
      spans.push(createSpan("table_row", line, placeholdersByToken));
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();
  return spans;
}

export function reassemble_spans(
  spans: readonly TranslatableSpan[],
): string {
  return spans.map((span) => span.text).join("\n");
}
