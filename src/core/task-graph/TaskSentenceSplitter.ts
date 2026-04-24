import { CompiledSentencesSchema, type CompiledSentences } from "../../schemas/pipeline.js";

const ACTION_STARTERS = [
  "find",
  "locate",
  "trace",
  "track",
  "follow",
  "show",
  "tell",
  "read",
  "search",
  "explore",
  "browse",
  "inspect",
  "analyze",
  "investigate",
  "explain",
  "diagnose",
  "review",
  "compare",
  "assess",
  "evaluate",
  "create",
  "build",
  "generate",
  "scaffold",
  "implement",
  "add",
  "make",
  "draft",
  "set up",
  "spin up",
  "bootstrap",
  "modify",
  "update",
  "change",
  "fix",
  "patch",
  "edit",
  "refactor",
  "rename",
  "rewrite",
  "remove",
  "replace",
  "improve",
  "optimize",
  "optimise",
  "tune",
  "correct",
  "test",
  "validate",
  "verify",
  "assert",
  "confirm",
  "ensure",
  "lint",
  "typecheck",
  "run",
  "execute",
  "deploy",
  "start",
  "launch",
  "restart",
  "stop",
  "install",
  "migrate",
  "seed",
  "serve",
  "document",
  "summarize",
  "summarise",
  "describe",
  "write",
  "prepare",
  "plan",
  "design",
  "organize",
  "outline",
  "strategize",
  "propose",
  "break down",
].sort((a, b) => b.length - a.length);

const FOLLOW_UP_STARTERS = [
  "test",
  "validate",
  "verify",
  "assert",
  "confirm",
  "ensure",
  "lint",
  "typecheck",
  "document",
  "summarize",
  "summarise",
  "write",
  "prepare",
  "plan",
  "outline",
  "design",
  "propose",
  "run",
  "execute",
  "deploy",
  "start",
  "launch",
  "restart",
  "stop",
  "install",
  "fix",
  "patch",
  "update",
  "modify",
  "analyze",
  "inspect",
  "review",
].sort((a, b) => b.length - a.length);

const ACTION_STARTER_REGEX = new RegExp(
  `^(?:${ACTION_STARTERS.map(escapeRegex).join("|")})\\b`,
  "i",
);

const FOLLOW_UP_STARTER_REGEX = new RegExp(
  `^(?:${FOLLOW_UP_STARTERS.map(escapeRegex).join("|")})\\b`,
  "i",
);

const PROTECTED_TOKEN_PREFIX = "__DETOKS_TOKEN_";

export class TaskSentenceSplitter {
  static split(rawInput: string): CompiledSentences {
    const protectedInput = this.protectLiterals(this.normalizeInput(rawInput));
    const lineSegments = this.splitLines(protectedInput.text);
    const sentences = lineSegments.flatMap((segment) => this.splitSegment(segment));
    const restored = sentences
      .map((sentence) => this.restoreLiterals(sentence, protectedInput.tokens))
      .map((sentence) => this.cleanClause(sentence))
      .filter(Boolean);

    return CompiledSentencesSchema.parse({ sentences: restored });
  }

  private static normalizeInput(rawInput: string): string {
    return rawInput
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  private static protectLiterals(text: string): { text: string; tokens: Map<string, string> } {
    const tokens = new Map<string, string>();
    let index = 0;
    const protectedText = text.replace(/`[^`]*`|"[^"]*"|(?<!\w)'[^']*'(?!\w)/g, (match) => {
      const token = `${PROTECTED_TOKEN_PREFIX}${index++}__`;
      tokens.set(token, match);
      return token;
    });

    return { text: protectedText, tokens };
  }

  private static restoreLiterals(text: string, tokens: Map<string, string>): string {
    let restored = text;
    for (const [token, value] of tokens.entries()) {
      restored = restored.replaceAll(token, value);
    }
    return restored;
  }

  private static splitLines(text: string): string[] {
    const expanded = text
      .replace(/(^|\n)\s*[-*]\s+/g, "$1")
      .replace(/(^|\n)\s*\d+[.)]\s+/g, "$1")
      .replace(/\s+(?=\d+[.)]\s+)/g, "\n");

    return expanded
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  private static splitSegment(segment: string): string[] {
    const sentenceParts = segment
      .split(/(?<=[.!?;])\s+(?=[A-Z0-9])/)
      .map((part) => part.trim())
      .filter(Boolean);

    return sentenceParts.flatMap((part) => this.splitClauses(part));
  }

  private static splitClauses(segment: string): string[] {
    const clauses = this.splitByCommas(segment);
    return clauses.flatMap((clause) => this.splitByOrdering(clause));
  }

  private static splitByCommas(segment: string): string[] {
    const parts = segment.split(/,\s+/);
    if (parts.length === 1) return [segment];

    const results: string[] = [];
    let current = parts[0] ?? "";

    for (let index = 1; index < parts.length; index += 1) {
      const next = parts[index] ?? "";
      const normalized = this.stripLeadingConnector(next);
      if (this.startsWithAction(normalized)) {
        results.push(current);
        current = normalized;
      } else {
        current = `${current}, ${next}`;
      }
    }

    results.push(current);
    return results.map((part) => this.cleanClause(part)).filter(Boolean);
  }

  private static splitByOrdering(segment: string): string[] {
    const beforeAfter = this.splitBeforeAfter(segment);
    if (beforeAfter) {
      return beforeAfter.flatMap((part) => this.splitAndThen(part));
    }
    return this.splitAndThen(segment);
  }

  private static splitBeforeAfter(segment: string): string[] | null {
    const match = /^(.*?)\b(before|after)\b(.*)$/i.exec(segment);
    if (!match) return null;

    const left = this.cleanClause(match[1] ?? "");
    const relation = (match[2] ?? "").toLowerCase();
    const right = this.cleanClause(match[3] ?? "");

    if (!left || !right || !this.startsWithAction(left) || !this.startsWithAction(right)) {
      return null;
    }

    return relation === "after" ? [right, left] : [left, right];
  }

  private static splitAndThen(segment: string): string[] {
    const explicit = segment.split(/\s+(?:and then|then|after that|afterwards)\s+/i);
    if (explicit.length > 1) {
      return explicit
        .map((part) => this.stripLeadingConnector(part))
        .flatMap((part) => this.splitFollowUp(part));
    }

    return this.splitFollowUp(segment);
  }

  private static splitFollowUp(segment: string): string[] {
    const match = /^(.*?)\s+\band\b\s+(.*)$/i.exec(segment);
    if (!match) return [this.cleanClause(segment)].filter(Boolean);

    const left = this.cleanClause(match[1] ?? "");
    const right = this.stripLeadingConnector(match[2] ?? "");

    if (!left || !right) return [this.cleanClause(segment)].filter(Boolean);
    if (!this.startsWithAction(left)) return [this.cleanClause(segment)].filter(Boolean);
    if (!this.startsWithFollowUpAction(right)) return [this.cleanClause(segment)].filter(Boolean);

    return [left, ...this.splitFollowUp(right)];
  }

  private static stripLeadingConnector(text: string): string {
    return text
      .trim()
      .replace(/^(?:and|then|after that|afterwards)\s+/i, "")
      .trim();
  }

  private static cleanClause(text: string): string {
    return text
      .trim()
      .replace(/^\d+[.)]\s*/, "")
      .replace(/^[,;:\-]+/, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\s+([,.;!?])/g, "$1")
      .trim();
  }

  private static startsWithAction(text: string): boolean {
    return ACTION_STARTER_REGEX.test(text.trim());
  }

  private static startsWithFollowUpAction(text: string): boolean {
    const trimmed = text.trim();
    return FOLLOW_UP_STARTER_REGEX.test(trimmed) || /^run\s+\w+\s+(?:test|tests)\b/i.test(trimmed);
  }
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
