import {
  CompiledSentencesSchema,
  type CompiledSentences,
} from "../../schemas/pipeline.js";
import { TaskSentenceSplitter } from "./TaskSentenceSplitter.js";

export interface TaskCandidate {
  text: string;
  orderHint?: number;
  discardedText?: string[];
}

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
  "check",
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

const ACTION_STARTER_REGEX = new RegExp(
  `^(?:${ACTION_STARTERS.map(escapeRegex).join("|")})(?=\\s|$)`,
  "i",
);

const ACTION_CLAUSE_REGEX = new RegExp(
  `\\b(?:${ACTION_STARTERS.map(escapeRegex).join("|")})(?=\\s|$)`,
  "i",
);

export class TaskCandidateExtractor {
  static extract(rawInput: string): TaskCandidate[] {
    const split = TaskSentenceSplitter.split(rawInput);
    const candidates: TaskCandidate[] = [];

    for (const [index, sentence] of split.sentences.entries()) {
      const candidate = this.normalizeCandidate(sentence, index);
      if (!candidate) {
        continue;
      }
      candidates.push(candidate);
    }

    return candidates;
  }

  static extractSentences(rawInput: string): CompiledSentences {
    const candidates = this.extract(rawInput);
    if (candidates.length > 0) {
      return CompiledSentencesSchema.parse({
        sentences: candidates.map((candidate) => candidate.text),
      });
    }

    return TaskSentenceSplitter.split(rawInput);
  }

  private static normalizeCandidate(
    sentence: string,
    index: number,
  ): TaskCandidate | null {
    const discardedText: string[] = [];
    let text = cleanWhitespace(sentence);
    text = stripToken(text, discardedText, /^(?:(?:can|could|would)\s+you\s+(?:please\s+)?|please\s+)/i);
    text = stripToken(text, discardedText, /^(?:and|also|so|then)\s+/i);
    text = stripToken(text, discardedText, /^(?:well|okay|actually|basically|honestly),?\s+/i);
    text = stripToken(text, discardedText, /^(?:if\s+(?:it'?s\s+)?(?:okay|possible)|if\s+you\s+(?:can|could)|when\s+possible|where\s+possible),?\s+/i);
    text = stripToken(text, discardedText, /^(?:first|second|third|fourth|fifth|next|finally|lastly),?\s+/i);
    text = stripToken(text, discardedText, /^(?:after|before|once)\b[^,]*,\s+/i);
    text = stripToken(text, discardedText, /^(?:be\s+sure\s+to|make\s+sure\s+to|try\s+to)\s+/i);

    text = normalizeCauseAction(text);
    text = extractActionClauseAfterDiscourse(text, discardedText);
    text = stripToken(text, discardedText, /^(?:be\s+sure\s+to|make\s+sure\s+to|try\s+to)\s+/i);
    text = cleanWhitespace(text);

    if (!text || this.isDiscardableMeta(text)) {
      return null;
    }

    if (!ACTION_STARTER_REGEX.test(text)) {
      return null;
    }

    return {
      text,
      orderHint: index,
      ...(discardedText.length > 0 ? { discardedText } : {}),
    };
  }

  private static isDiscardableMeta(text: string): boolean {
    const normalized = text.toLowerCase();
    return (
      /^(?:process|perform|complete|handle|do)\s+(?:the\s+)?(?:(?:following\b.*)|(?:these\b.*\btasks?\b))/i.test(text) ||
      /\bnot urgent\b/.test(normalized) ||
      /\breduce unnecessary words\b/.test(normalized) ||
      /\bmaintain only the important sequence\b/.test(normalized) ||
      /\bsame thing twice\b/.test(normalized) ||
      /\bstep-by-step\b/.test(normalized)
    );
  }
}

function extractActionClauseAfterDiscourse(
  text: string,
  discardedText: string[],
): string {
  const commaParts = text.split(/,\s+/);
  if (commaParts.length <= 1) {
    return text;
  }

  for (let index = 1; index < commaParts.length; index += 1) {
    const suffix = commaParts.slice(index).join(", ");
    const match = ACTION_CLAUSE_REGEX.exec(suffix);
    if (!match || match.index > 8) {
      continue;
    }

    const discarded = commaParts.slice(0, index).join(", ");
    if (discarded) {
      discardedText.push(discarded);
    }
    return suffix.slice(match.index);
  }

  return text;
}

function stripToken(
  text: string,
  discardedText: string[],
  pattern: RegExp,
): string {
  const match = pattern.exec(text);
  if (!match?.[0]) {
    return text;
  }

  discardedText.push(match[0].trim());
  return text.slice(match[0].length).trim();
}

function cleanWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/[,;:]+$/u, "")
    .trim();
}

function normalizeCauseAction(text: string): string {
  const sinceProblem = text.replace(
    /^(?:and\s+)?since\s+there\s+seems\s+to\s+be\s+a\s+problem\s+due\s+to\s+(.+?),\s*(?:please\s+)?fix\s+that\s+bug\.?$/i,
    "fix the bug due to $1.",
  );
  if (sinceProblem !== text) {
    return sinceProblem;
  }

  return text.replace(
    /^(?:and\s+)?(?:probably\s+)?the\s+problem\s+is\s+caused\s+by\s+(.+?),\s*so\s+fix\s+that\s+bug\.?$/i,
    "fix the bug caused by $1.",
  );
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
