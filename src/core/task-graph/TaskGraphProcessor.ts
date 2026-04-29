import { createHash } from "node:crypto";
import {
  CompiledSentencesSchema,
  TaskGraphSchema,
} from "../../schemas/pipeline.js";
import type { Task, TaskGraph, RequestCategory } from "../../schemas/pipeline.js";

/**
 * Role 2.1 내부 sentence split 결과를 받아 실행 가능한 TaskGraph로 변환합니다.
 *
 * ─── 역할 분담 ──────────────────────────────────────────────────
 * Role 1 담당 : 한국어 → 영어 변환, compressed_prompt 생성
 * Role 2.1 내부 보조 : compiled_prompt 문자열을 sentence 단위로 분리
 * Role 2.1 담당 (이 클래스):
 *   1. single(문장 1개) / multi(문장 여러 개) 요청 구분
 *   2. 각 문장의 type 분류 (explore / create / modify / ...)
 *   3. task id 자동 생성 (t1, t2, t3, ...)
 *   4. depends_on 결정 — 이전 type → 현재 type이 자연스러운 흐름이면 sequential(의존),
 *                        흐름이 끊기면 parallel(독립, depends_on: [])
 * ────────────────────────────────────────────────────────────────
 *
 * 전체 파이프라인에서의 위치:
 *   Role 1 output (compiled_prompt)
 *     → Role 2.1 internal split (sentences[])
 *     → TaskGraphProcessor.process()   ← 여기
 *     → DAGValidator.validate()
 *     → DependencyResolver.resolve()
 *     → ParallelClassifier.classify()
 */
export class TaskGraphProcessor {
  // 'make' 등 단일 키워드가 create/modify 패턴에 먼저 걸리는 숙어들을 TYPE_PATTERNS보다 먼저 처리.
  // 패턴 순서가 바뀌어도 이 테이블의 판정은 항상 우선한다.
  private static readonly IDIOM_PATTERNS: ReadonlyArray<{
    type: RequestCategory;
    pattern: RegExp;
  }> = [
    // make + sure/certain → validate  (create의 'make' 키워드보다 먼저 차단)
    { type: "validate", pattern: /\bmake\s+(sure|certain)\b/i },
    // make + changes/improvements/… → modify
    { type: "modify",   pattern: /\bmake\s+(changes?|adjustments?|modifications?|improvements?|updates?|fixes?|tweaks?)\b/i },
    // make use of → execute
    { type: "execute",  pattern: /\bmake\s+use\s+of\b/i },
    // make a note/notes → document
    { type: "document", pattern: /\bmake\s+(?:a\s+)?notes?\b/i },
    { type: "modify",   pattern: /\borganize\b.*\b(logic|code|functions?|services?|class(?:es)?|modules?|validation|duplicated?|redundan[ct]?)\b/i },
    { type: "document", pattern: /\borganize\b.*\b(changes?|results?|commands?)\b.*\b(work\s+notes?|notes?)\b/i },
    { type: "analyze",  pattern: /\btrace\b.*\bexplain\b.*\b(order|how|flow|passes?|through)\b/i },
    // make a plan/roadmap → plan
    { type: "plan",     pattern: /\bmake\s+(?:a\s+)?(?:plan|roadmap)\b/i },
  ];

  // Dependency transitions should stay aligned with docs/TYPE_DEFINITION.md.
  // In particular, explore means discovery, analyze means interpretation.
  // Document is often terminal, but an explicit follow-up action can still
  // continue the user's ordered workflow.
  private static readonly TYPE_PATTERNS: ReadonlyArray<{
    type: RequestCategory;
    patterns: readonly RegExp[];
  }> = [
    {
      type: "explore",
      patterns: [
        /\b(show|tell)\s+me\s+(where|which|what)\b/,
        /\b(find|show|list)\s+(all\s+)?(references|usages|occurrences|call\s+sites)\b/,
        /\b(trace|track|follow)\b.*\b(from|to|through)\b/,
        /\bwhere\b.*\b(defined|implemented|used|referenced|located)\b/,
        /\bwhich\s+(file|module|function|class|component|service)\b/,
        /\bwhat\s+(file|module|function|class|component|service)\b/,
        /\b(read|find|look(?:\s+for)?|search|explore|browse|locate|discover|lookup|query|grep)\b/,
        /\b(trace|track|follow|walk\s+through|scan|survey|map\s+out|list)\b/,
      ],
    },
    {
      type: "document",
      patterns: [
        /\b(create|generate|draft|produce)\s+(a\s+|an\s+|the\s+)?(comprehensive\s+)?(documentation|docs|readme|guide|docstring|comment[s]?)\b/,
        /\b(write|update|add)\s+(the\s+)?(documentation|docs|readme|guide|docstring|comment[s]?)\b/,
        /\b(write|prepare)\s+(a\s+)?(summary|overview|note[s]?|guide)\b/,
        /\bdocument\b.*\b(api|module|system|workflow|changes?)\b/,
        /\b(document|docs|summari[sz]e|describe|explain\s+in\s+docs)\b/,
      ],
    },
    {
      type: "create",
      patterns: [
        /\b(create|build|generate|scaffold|implement)\s+(a|an|the)?\s*(new\s+)?(module|service|component|endpoint|api|worker|function|class|file)\b/,
        /\bset\s+up\b.*\b(project|service|worker|pipeline|job)\b/,
        /\b(create|implement|write|add|generate|make|draft|scaffold|introduce)\b(?!\s+(the\s+)?(tests?|specs?|test\s+cases?))/,
        /\bset\s+up\b/,
        /\bspin\s+up\b/,
        /\bbootstrap\b/,
      ],
    },
    {
      type: "modify",
      patterns: [
        /\b(fix|patch|update|change|edit|refactor|rewrite|rename)\b.*\b(bug|issue|config|logic|function|module|file|implementation)\b/,
        /\bremove\b.*\b(dead\s+code|unused\s+code|legacy\s+code)\b/,
        /\b(modify|update|change|fix|edit|refactor|revise|adjust|patch|rewrite|rename|clean\s+up)\b/,
        /\bremove\b/,
        /\breplace\b/,
        /\bimprove\b/,
        /\boptimi[sz]e\b/,
        /\btune\b/,
        /\bcorrect\b/,
      ],
    },
    {
      type: "analyze",
      patterns: [
        /\b(explain|analyze|investigate|diagnose|understand)\b.*\b(why|how|behavior|flow|issue|problem|failure)\b/,
        /\b(root\s+cause|impact|trade[\s-]?off)\b/,
        /\b(propose|suggest|recommend)\b.*\b(fixes?|solutions?|remediation|approach|steps?|improvements?|optimizations?|settings?|ways?|options?|guidelines?|policy|strategy)\b/,
        /\bcompare\b.*\b(vs|with|against)\b/,
        /\b(analyze|review|inspect|investigate|understand|explain|diagnose|profile)\b/,
        /\b(compare|assess|evaluate|reason\s+about)\b/,
        /\bhow\b.*\b(work|works|behaves|behave|flows|flow)\b/,
        /\bwhy\b/,
      ],
    },
    {
      type: "validate",
      patterns: [
        /\b(run|execute)\s+(the\s+)?(tests?|checks?|validation|verifications?)\b/,
        /\b(run|execute)\s+(the\s+)?(lint|linter|typecheck|type-check|qa|smoke\s+tests?)\b/,
        /\b(make\s+sure|ensure|verify|confirm)\b/,
        /\b(test|tests|validate|verify|assert|confirm|ensure|check\s+(?:if|whether|that))\b/,
        /\b(lint|typecheck|smoke\s+test|qa)\b/,
        /\b(pass|passes|passing|fail|fails|failing)\b/,
      ],
    },
    {
      type: "execute",
      patterns: [
        /\b(run|start|launch|restart|stop)\s+(the\s+)?(server|app|application|service|worker|job)\b/,
        /\b(run|execute)\s+(the\s+)?(build|migration|migrations|deploy|deployment|seed)\b/,
        /\binstall\b.*\b(dependencies|packages|requirements)\b/,
        /\b(run|execute|deploy|start|launch|trigger|invoke)\b/,
        /\binstall\b/,
        /\b(migrate|seed|compile|build|serve|restart|stop)\b/,
      ],
    },
    {
      type: "plan",
      patterns: [
        /\b(plan|outline|design|organize)\b.*\b(steps?|strategy|approach|roadmap|rollout|migration)\b/,
        /\bbreak\s+down\b.*\b(steps?|tasks?|work)\b/,
        /\bstep[\s-]?by[\s-]?step\b.*\b(plan|approach|guide)\b/,
        /\b(plan|design|organize|outline|strategize)\b/,
        /\bbreak\s+down\b/,
        /\bsequence\b/,
        /\broadmap\b/,
        /\bstep[\s-]?by[\s-]?step\b/,
        /\bapproach\b/,
        /\bgame\s+plan\b/,
      ],
    },
    // 키워드가 없는 질문형 문장의 최후 fallback — 모든 키워드 패턴 검사 후 여기 도달.
    // 위 패턴들이 먼저 소비하므로 "How can we validate?" 같은 케이스는 validate에서 처리됨.
    { type: "analyze", patterns: [/\?$/] },
  ];
  /**
   * type A → type B 전환이 "자연스러운 실행 흐름"인 조합을 정의한 테이블입니다.
   *
   * 이 테이블에 해당하면 → sequential (t_prev 완료 후 t_curr 실행, depends_on: ["t_prev"])
   * 해당하지 않으면   → parallel  (서로 독립 실행, depends_on: [])
   *
   * 예시:
   *   "explore" 다음 "analyze" → 자연스러운 흐름 (탐색 후 분석)    → sequential
   *   "explore" 다음 "document"→ 테이블에 없음 (탐색 후 바로 문서화는 비약) → parallel
   *   "create"  다음 "validate"→ 자연스러운 흐름 (생성 후 검증)    → sequential
   *
   * document는 보통 마지막 단계이므로 어떤 type도 뒤따르지 않음 → 빈 배열
   */
  // All type→type transitions are valid. A user prompt lists tasks in intended
  // execution order, so every task should depend on its predecessor.
  // Omitting any transition caused isolated nodes (depends_on: []) for non-first
  // tasks, which incorrectly parallelised them.
  private static readonly FLOWS_TO: Partial<Record<RequestCategory, RequestCategory[]>> = {
    explore:  ["explore", "analyze", "modify", "create", "validate", "plan", "document", "execute"],
    plan:     ["explore", "analyze", "create", "execute", "document", "modify", "validate", "plan"],
    analyze:  ["explore", "analyze", "modify", "validate", "document", "create", "plan", "execute"],
    create:   ["validate", "modify", "document", "execute", "explore", "analyze", "create", "plan"],
    modify:   ["analyze", "validate", "document", "execute", "explore", "modify", "create", "plan"],
    validate: ["explore", "analyze", "document", "execute", "modify", "validate", "create", "plan"],
    execute:  ["explore", "analyze", "validate", "document", "plan", "create", "execute", "modify"],
    document: ["analyze", "modify", "validate", "execute", "create", "plan", "explore", "document"],
  };

  /**
   * Role 2.1 내부 sentence split 결과를 파싱하여 TaskGraph를 반환합니다.
   *
   * @param rawInput - Role 2.1 내부 분리 결과. 내부적으로 CompiledSentencesSchema로 검증.
   *                   형식: { sentences: string[] }
   * @returns 유효성 검증된 TaskGraph 객체 (Zod parse 통과)
   *
   * single 예시 (문장 1개):
   *   input : { sentences: ["Explore the src directory"] }
   *   output: { tasks: [{ id:"t1", type:"explore", depends_on:[], ... }] }
   *
   * multi 예시 (문장 여러 개):
   *   input : { sentences: ["Explore src", "Analyze structure", "Create module"] }
   *   types : ["explore", "analyze", "create"]
   *   흐름  : explore→analyze (O, sequential), analyze→create (O, sequential)
   *   output: t1(depends_on:[]), t2(depends_on:["t1"]), t3(depends_on:["t2"])
   */
  static process(rawInput: unknown): TaskGraph {
    const { sentences } = CompiledSentencesSchema.parse(rawInput);

    // single 요청: 문장이 1개면 의존 관계가 성립하지 않으므로 바로 반환
    if (sentences.length === 1) {
      const sentence = sentences[0]!;
      const type = this.classifyType(sentence);
      const tasks = [this.buildTask(sentence, 0, type, [])];
      return TaskGraphSchema.parse({ tasks });
    }

    // multi 요청
    // ① 먼저 모든 문장의 type을 한 번에 분류 — resolveDependsOn에서 이전 type을 참조하기 때문
    const types: RequestCategory[] = sentences.map((s) => this.classifyType(s));

    // ② 각 문장을 Task로 변환하면서 depends_on 결정
    const tasks: Task[] = sentences.map((sentence, index) => {
      const type = types[index]!;
      const dependsOn = this.resolveDependsOn(index, types);
      return this.buildTask(sentence, index, type, dependsOn);
    });

    return TaskGraphSchema.parse({ tasks });
  }

  /**
   * index번째 task의 depends_on을 결정합니다.
   *
   * 판단 기준: FLOWS_TO[이전 type]에 현재 type이 포함되어 있으면 sequential
   *
   * 예시:
   *   types = ["explore", "analyze", "document"]
   *   index=1: FLOWS_TO["explore"].includes("analyze") → true  → depends_on: ["t1"]
   *   index=2: FLOWS_TO["analyze"].includes("document")→ true  → depends_on: ["t2"]
   *
   *   types = ["create", "explore"]
   *   index=1: FLOWS_TO["create"].includes("explore")  → false → depends_on: []  (병렬)
   */
  private static resolveDependsOn(index: number, types: RequestCategory[]): string[] {
    // 첫 번째 task는 항상 아무것도 기다리지 않음
    if (index === 0) return [];
    const prev = types[index - 1] as RequestCategory;
    const curr = types[index] as RequestCategory;
    // t1, t2, t3... — index는 0-based이므로 이전 task id는 `t${index}` (1-based 기준)
    return this.FLOWS_TO[prev]?.includes(curr) ? [`t${index}`] : [];
  }

  /**
   * 하나의 문장으로부터 Task 객체를 생성합니다.
   *
   * @param sentence  - Role 2.1 내부 분리 결과의 영어 문장 (title로 그대로 사용)
   * @param index     - 0-based 인덱스 → id는 `t${index+1}` 형태
   * @param type      - classifyType()이 결정한 RequestCategory
   * @param dependsOn - resolveDependsOn()이 결정한 선행 task id 배열
   */
  private static buildTask(
    sentence: string,
    index: number,
    type: RequestCategory,
    dependsOn: string[]
  ): Task {
    const id = `t${index + 1}`;
    return {
      id,
      type,
      title: sentence,         // Role 1이 이미 영어로 변환한 문장을 그대로 사용
      status: "pending",       // 모든 task는 생성 시점에 pending 상태로 초기화
      input_hash: this.computeInputHash(id, type, sentence),
      depends_on: dependsOn,
    };
  }

  /**
   * 영어 문장에서 키워드를 찾아 RequestCategory를 결정합니다.
   *
   * 매칭 우선순위: 위에서 아래 순서로 첫 번째 매칭된 type 반환
   * 아무 키워드도 매칭되지 않으면 "execute"를 기본값으로 사용
   *
   * 예시:
   *   "Find all usages of X"    → "read|find|..." 매칭  → "explore"
   *   "Create a new component"  → "create|implement|..." 매칭 → "create"
   *   "Run the tests"           → "test|validate|..." 매칭 → "validate"
   */
  // Semantic category meaning is defined in docs/TYPE_DEFINITION.md.
  // This method is still a first-match keyword classifier, not a full semantic parser.
  // Example: "Run the tests" currently resolves to "validate" because /test/ matches
  // before the execute keywords are evaluated.
  private static classifyType(sentence: string): RequestCategory {
    const s = sentence.toLowerCase();
    for (const { type, pattern } of this.IDIOM_PATTERNS) {
      if (pattern.test(s)) return type;
    }
    for (const entry of this.TYPE_PATTERNS) {
      if (entry.patterns.some((pattern) => pattern.test(s))) {
        return entry.type;
      }
    }
    return "execute"; // 기본값: 어떤 키워드도 매칭되지 않으면 일반 실행 작업으로 분류
  }

  /**
   * task의 고유 식별 해시를 생성합니다. (SHA-256 앞 16자리)
   *
   * id + type + sentence 세 값을 조합해서 해시화하므로
   * 같은 문장이라도 id나 type이 다르면 다른 hash가 생성됩니다.
   * 이후 캐싱, 중복 실행 방지, 상태 추적 등에 활용할 수 있습니다.
   */
  private static computeInputHash(id: string, type: string, sentence: string): string {
    const content = JSON.stringify({ id, type, sentence });
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
  }
}
