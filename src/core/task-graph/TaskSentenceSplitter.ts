import {
  CompiledSentencesSchema,
  type CompiledSentences,
} from "../../schemas/pipeline.js";

// 문장이 액션(동작)으로 시작하는지 판별하기 위한 동사 목록
// sort: 긴 문자열 우선 매칭 (예: "set up"이 "set"보다 먼저 매칭되도록)
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

// "and"로 연결된 후속 절이 독립 태스크인지 판별하는 동사 목록
// ACTION_STARTERS의 부분집합으로, 후속 작업에 흔히 쓰이는 동사만 포함
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
  "add",
].sort((a, b) => b.length - a.length);

// 문자열 앞부분이 액션 동사로 시작하는지 검사하는 정규식
const ACTION_STARTER_REGEX = new RegExp(
  `^(?:${ACTION_STARTERS.map(escapeRegex).join("|")})\\b`,
  "i",
);

// 문자열 앞부분이 후속 액션 동사로 시작하는지 검사하는 정규식
const FOLLOW_UP_STARTER_REGEX = new RegExp(
  `^(?:${FOLLOW_UP_STARTERS.map(escapeRegex).join("|")})\\b`,
  "i",
);

// 리터럴 보호용 토큰 prefix (backtick/따옴표 안의 내용을 임시 치환할 때 사용)
const PROTECTED_TOKEN_PREFIX = "__DETOKS_TOKEN_";

export class TaskSentenceSplitter {
  // 자유형식 텍스트를 독립 태스크 문장 배열로 분리하는 진입점
  static split(rawInput: string): CompiledSentences {
    // 1) 입력 정규화 → 2) 리터럴 보호 (코드/따옴표 내용을 토큰으로 치환)
    const protectedInput = this.protectLiterals(this.normalizeInput(rawInput));
    // 3) 줄 단위로 분리
    const lineSegments = this.splitLines(protectedInput.text);
    // 4) 각 줄을 문장 단위로 분리
    const sentences = lineSegments.flatMap((segment) =>
      this.splitSegment(segment),
    );
    // 5) 보호했던 리터럴 복원 → 클린업 → 빈 항목 제거
    const restored = sentences
      .map((sentence) => this.restoreLiterals(sentence, protectedInput.tokens))
      .map((sentence) => this.cleanClause(sentence))
      .filter(Boolean);

    return CompiledSentencesSchema.parse({ sentences: restored });
  }

  // 줄바꿈/공백 등을 통일하여 파싱 오류를 줄임
  private static normalizeInput(rawInput: string): string {
    return rawInput
      .replace(/\r\n?/g, "\n") // Windows/Mac 줄바꿈 → \n
      .replace(/ /g, " ") // 비파괴 공백 → 일반 공백
      .replace(/[ \t]+/g, " ") // 연속 공백/탭 → 공백 1개
      .replace(/\n{3,}/g, "\n\n") // 3개 이상 빈 줄 → 2개로 축소
      .trim();
  }

  // backtick/따옴표로 감싼 리터럴을 임시 토큰으로 치환하여 분리 로직이 내용을 건드리지 않도록 보호
  private static protectLiterals(text: string): {
    text: string;
    tokens: Map<string, string>;
  } {
    const tokens = new Map<string, string>();
    let index = 0;
    const protectedText = text.replace(
      /`[^`]*`|"[^"]*"|(?<!\w)'[^']*'(?!\w)/g,
      (match) => {
        const token = `${PROTECTED_TOKEN_PREFIX}${index++}__`;
        tokens.set(token, match);
        return token;
      },
    );

    return { text: protectedText, tokens };
  }

  // 임시 토큰을 원래 리터럴 값으로 되돌림
  private static restoreLiterals(
    text: string,
    tokens: Map<string, string>,
  ): string {
    let restored = text;
    for (const [token, value] of tokens.entries()) {
      restored = restored.replaceAll(token, value);
    }
    return restored;
  }

  // 글머리 기호(-, *, •) 및 번호 목록을 제거하고 줄 단위로 분리
  private static splitLines(text: string): string[] {
    const expanded = text
      .replace(/(^|\n)\s*[-*•◦]\s+/g, "$1") // 글머리 기호 제거
      .replace(/(^|\n)\s*\d+[.)]\s+/g, "$1") // "1. " / "1) " 형태 번호 제거
      .replace(/\s+(?=\d+[.)]\s+)/g, (match, offset, source) => {
        const previous = source.slice(0, offset).trimEnd().at(-1);
        return previous && /[+\-*/=]/.test(previous) ? match : "\n";
      }); // 번호 앞 공백을 줄바꿈으로 변환하되 수식은 보존

    return expanded
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  // 하나의 줄(segment)을 문장 부호([.!?;])를 기준으로 분리한 뒤 각 파트를 절 단위로 추가 분리
  private static splitSegment(segment: string): string[] {
    const sentenceParts = segment
      // 문장 종결 부호 뒤에 대문자/숫자가 오면 분리 (lookbehind/lookahead 사용)
      .split(/(?<=[.!?;])\s+(?=[A-Z0-9])/)
      .map((part) => part.trim())
      .filter(Boolean);

    return sentenceParts.flatMap((part) => this.splitClauses(part));
  }

  // 쉼표 분리 → before/after/and then 순서 분리를 순서대로 적용
  private static splitClauses(segment: string): string[] {
    const clauses = this.splitByCommas(segment);
    return clauses.flatMap((clause) => this.splitByOrdering(clause));
  }

  // 쉼표(", ")로 분리하되, 다음 절이 액션 동사로 시작하는 경우에만 독립 태스크로 분리
  // 조건절(if/unless/when 등) 뒤에 오는 쉼표는 분리하지 않음
  private static splitByCommas(segment: string): string[] {
    const parts = segment.split(/,\s+/);
    if (parts.length === 1) return [segment];

    const results: string[] = [];
    let current = parts[0] ?? "";

    for (let index = 1; index < parts.length; index += 1) {
      const next = parts[index] ?? "";
      const normalized = this.stripLeadingConnector(next);
      const isConditionalClause =
        /^(?:if|unless|when|until|provided|assuming)\b/i.test(current.trim());
      if (this.startsWithAction(normalized) && !isConditionalClause) {
        results.push(current);
        current = normalized;
      } else {
        // 액션이 아니거나 조건절이면 쉼표 포함 그대로 이어붙임
        current = `${current}, ${next}`;
      }
    }

    results.push(current);
    return results.map((part) => this.cleanClause(part)).filter(Boolean);
  }

  // before/after 키워드로 순서를 명시한 경우 올바른 실행 순서로 재배열하고,
  // 그 다음 "and then" 계열 분리를 적용
  private static splitByOrdering(segment: string): string[] {
    const beforeAfter = this.splitBeforeAfter(segment);
    if (beforeAfter) {
      return beforeAfter.flatMap((part) => this.splitAndThen(part));
    }
    return this.splitAndThen(segment);
  }

  // "A before B" / "A after B" 패턴 감지 → 실행 순서에 맞게 [앞 작업, 뒤 작업] 반환
  // 양쪽이 모두 액션 동사로 시작해야 분리 (그렇지 않으면 null 반환)
  private static splitBeforeAfter(segment: string): string[] | null {
    const match = /^(.*?)\b(before|after)\b(.*)$/i.exec(segment);
    if (!match) return null;

    const left = this.cleanClause(match[1] ?? "");
    const relation = (match[2] ?? "").toLowerCase();
    const right = this.cleanClause(match[3] ?? "");

    if (
      !left ||
      !right ||
      !this.startsWithAction(left) ||
      !this.startsWithAction(right)
    ) {
      return null;
    }

    // "after"이면 right가 먼저 실행, "before"이면 left가 먼저 실행
    return relation === "after" ? [right, left] : [left, right];
  }

  // "and then", "then", "after that", "afterwards" 등의 명시적 순서 접속어로 분리
  private static splitAndThen(segment: string): string[] {
    const explicit = segment.split(
      /\s+(?:and then|then|after that|afterwards)\s+/i,
    );
    if (explicit.length > 1) {
      return explicit
        .map((part) => this.stripLeadingConnector(part))
        .flatMap((part) => this.splitFollowUp(part));
    }

    return this.splitFollowUp(segment);
  }

  // "A and B" 패턴에서 B가 후속 액션 동사로 시작하면 독립 태스크로 분리
  // 단, "find and add" 같은 복합 동사(목적어 없는 단일 동사)는 분리하지 않음
  private static splitFollowUp(segment: string): string[] {
    const match = /^(.*?)\s+\band\b\s+(.*)$/i.exec(segment);
    if (!match) return [this.cleanClause(segment)].filter(Boolean);

    const left = this.cleanClause(match[1] ?? "");
    const right = this.stripLeadingConnector(match[2] ?? "");

    if (!left || !right) return [this.cleanClause(segment)].filter(Boolean);
    if (!this.startsWithAction(left))
      return [this.cleanClause(segment)].filter(Boolean);
    if (!this.startsWithFollowUpAction(right))
      return [this.cleanClause(segment)].filter(Boolean);
    // "find and add" 같은 compound verb 방지: left에 object(동사 외 단어)가 있어야 분리
    if (left.trim().split(/\s+/).length < 2)
      return [this.cleanClause(segment)].filter(Boolean);

    return [left, ...this.splitFollowUp(right)];
  }

  // 절 앞에 붙은 접속사(and/then/after that 등) 제거
  private static stripLeadingConnector(text: string): string {
    return text
      .trim()
      .replace(/^(?:and|then|after that|afterwards)\s+/i, "")
      .trim();
  }

  // 번호 목록 접두사, 선행 구두점, 중복 공백 등을 정리하여 깔끔한 문장으로 만듦
  private static cleanClause(text: string): string {
    return text
      .trim()
      .replace(/^\d+[.)]\s*/, "") // "1. " / "1) " 제거
      .replace(/^[,;:\-]+/, "") // 선행 구두점 제거
      .replace(/[ \t]+/g, " ") // 중복 공백 제거
      .replace(/\s+([,.;!?])/g, "$1") // 구두점 앞 공백 제거
      .trim();
  }

  // 텍스트가 ACTION_STARTERS 동사 중 하나로 시작하는지 확인
  private static startsWithAction(text: string): boolean {
    return ACTION_STARTER_REGEX.test(text.trim());
  }

  // 텍스트가 FOLLOW_UP_STARTERS 동사로 시작하거나 "run * test(s)" 형태인지 확인
  private static startsWithFollowUpAction(text: string): boolean {
    const trimmed = text.trim();
    return (
      FOLLOW_UP_STARTER_REGEX.test(trimmed) ||
      /^run\s+\w+\s+(?:test|tests)\b/i.test(trimmed)
    );
  }
}

// 정규식 특수문자를 이스케이프하여 리터럴 문자열로 사용할 수 있게 변환
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
