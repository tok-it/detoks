# 태스크 그래프 생성 전략 선택 근거

> 발표 자료용 — 처음 보는 사람도 이해할 수 있도록 작성되었습니다.
>
> 관련 문서: DAG_TOPOLOGICAL_SORT_RATIONALE.md (이 그래프를 실행하는 방법)

---

## 1. 이 문서가 다루는 문제

DAG 문서가 "만들어진 그래프를 어떻게 안전하게 실행하나"를 다룬다면,  
이 문서는 그보다 앞선 질문을 다룹니다.

> **그래프 자체를 어떻게 만드는가?**

사용자의 자연어 요청으로부터 태스크 그래프를 자동으로 구성하려면  
두 가지 결정이 필요합니다.

```
결정 A: 각 문장이 어떤 "종류"의 태스크인가?
        "코드를 찾아봐"  → explore?  analyze?  execute?

결정 B: 문장들 사이에 의존 관계가 있는가?
        "찾아보고, 분석해줘"  → 순차(t2 depends_on t1)?  병렬(독립)?
```

---

## 2. 결정 A — 타입 분류: 어떤 방법으로 문장의 종류를 판단하는가?

### 분류해야 하는 8가지 타입

```
explore   — 탐색  ("find", "search", "where is")
analyze   — 분석  ("explain", "why", "how does")
create    — 생성  ("create", "implement", "add")
modify    — 수정  ("fix", "refactor", "update")
validate  — 검증  ("test", "verify", "ensure")
execute   — 실행  ("run", "deploy", "install")
plan      — 계획  ("plan", "outline", "roadmap")
document  — 문서화("document", "write docs")
```

---

### 방법 A-1: LLM 기반 의미 분류

**동작 방식**: 문장을 LLM에 보내서 "이 문장은 어떤 타입인가?"를 물어봅니다.

```
입력: "Find all references to UserService"
프롬프트: "Classify this sentence into one of: explore, analyze, create..."
LLM 응답: "explore"
```

```
┌──────────────────────────────────────────────────────────────────┐
│  PROBLEM 1: 비결정론적 — 같은 입력에 다른 출력이 나올 수 있음    │
│                                                                  │
│  "Find all usages" → 1회: "explore" / 2회: "analyze"            │
│  → 같은 요청이 실행마다 다른 그래프를 만들 수 있음               │
├──────────────────────────────────────────────────────────────────┤
│  PROBLEM 2: 지연 및 비용 발생                                    │
│                                                                  │
│  태스크 분류마다 LLM API 호출 필요                                │
│  → 문장 5개 = LLM 호출 5회 (분류 단계에서만)                     │
│  → 실제 실행 전 준비 단계에서 이미 비용 소모                      │
├──────────────────────────────────────────────────────────────────┤
│  PROBLEM 3: 테스트 불가                                          │
│                                                                  │
│  "Run the tests" → 오늘은 validate, 내일은 execute?              │
│  → 단위 테스트로 분류 로직을 고정할 수 없음                       │
└──────────────────────────────────────────────────────────────────┘
```

---

### 방법 A-2: 통계적 ML 분류기 (BERT, TF-IDF + SVM 등)

**동작 방식**: 훈련된 분류 모델로 문장 벡터를 분류합니다.

```
문장 → 토크나이저 → 임베딩 → 분류 헤드 → "explore"
```

```
┌──────────────────────────────────────────────────────────────────┐
│  PROBLEM 1: 모델 의존성                                           │
│                                                                  │
│  배포 환경에 모델 파일 포함 필요 (수십 MB ~ 수 GB)               │
│  → 시스템 경량화 목표와 충돌                                      │
├──────────────────────────────────────────────────────────────────┤
│  PROBLEM 2: 훈련 데이터 필요                                      │
│                                                                  │
│  8가지 타입에 맞는 레이블된 문장 수천 개 필요                     │
│  → 초기 시스템에서 현실적으로 확보 어려움                         │
├──────────────────────────────────────────────────────────────────┤
│  PROBLEM 3: 분류 경계 불투명                                      │
│                                                                  │
│  "Run the build and test" → 왜 execute가 아니라 validate인가?    │
│  → 모델 내부 가중치가 결정 — 디버깅 어려움                        │
└──────────────────────────────────────────────────────────────────┘
```

---

### 방법 A-3: 정규식 키워드 매칭 — First-match (선택된 방법) ✓

**동작 방식**: 각 타입마다 키워드 패턴 목록을 정의하고, 위에서부터 첫 번째 매칭된 타입을 반환합니다.

```typescript
// TaskGraphProcessor.ts 실제 구현 (일부)

TYPE_PATTERNS = [
  {
    type: "explore",
    patterns: [
      /\b(find|show|list)\s+(all\s+)?(references|usages)\b/,
      /\b(read|find|look|search|explore|locate)\b/,
      // ...
    ]
  },
  {
    type: "validate",
    patterns: [
      /\b(run|execute)\s+(the\s+)?(tests?|checks?)\b/,
      /\b(test|validate|verify|ensure|check\s+if)\b/,
      // ...
    ]
  },
  // ... 8개 타입
]
```

### 시각화 — First-match 흐름

```
입력: "Run the tests and check the results"
      ↓ lowercase
      "run the tests and check the results"

[패턴 목록 순서대로 검사]

  explore   패턴 검사 → 매칭 없음  →  다음
  document  패턴 검사 → 매칭 없음  →  다음
  create    패턴 검사 → 매칭 없음  →  다음
  modify    패턴 검사 → 매칭 없음  →  다음
  analyze   패턴 검사 → 매칭 없음  →  다음
  validate  패턴 검사 → /test/ 매칭! → "validate" 반환 ✓
```

```
입력: "Create a new API endpoint"

  explore  → 없음
  document → 없음
  create   → /create.*endpoint/ 매칭! → "create" 반환 ✓
```

### 왜 이 방식을 선택했나

```
┌──────────────────────────────────────────────────────────────────┐
│  BENEFIT 1: 결정론적                                              │
│                                                                  │
│  같은 입력 → 항상 같은 타입                                       │
│  → 단위 테스트로 모든 분류 규칙을 고정 가능                       │
├──────────────────────────────────────────────────────────────────┤
│  BENEFIT 2: 즉각 실행, 비용 없음                                  │
│                                                                  │
│  O(patterns) — 보통 50개 미만의 패턴 순회                         │
│  LLM 호출 없음, 모델 로딩 없음                                    │
├──────────────────────────────────────────────────────────────────┤
│  BENEFIT 3: 수정이 쉬움                                           │
│                                                                  │
│  새 패턴 추가 = 배열에 한 줄 추가                                  │
│  모델 재훈련 불필요                                               │
├──────────────────────────────────────────────────────────────────┤
│  TRADE-OFF: 의미 파악 없음                                        │
│                                                                  │
│  "Run the tests" → /test/ 가 validate보다 먼저 매칭               │
│  → "run"의 동작 의미보다 "tests"라는 명사가 우선                   │
│  코드 주석: "This is a first-match classifier, not a semantic     │
│             parser." (TaskGraphProcessor.ts:261)                  │
└──────────────────────────────────────────────────────────────────┘
```

**학술 근거**: Manning et al. (2008) *"Introduction to Information Retrieval"*, Cambridge University Press, Ch. 13
> 규칙 기반 분류(rule-based classification)는 클래스 경계가 명확하고 어휘 집합이 도메인으로 제한되는 경우, 훈련 데이터 없이도 통계적 분류기에 준하는 정밀도를 달성할 수 있다. (Ch. 13의 Naive Bayes 비교 논의 참조, 이하 요약·인용)

---

### 타입 분류 방법 비교

```
┌──────────────────┬──────────────┬──────────────┬──────────────────┐
│ 기준             │ LLM 분류      │ ML 분류기     │ Regex 매칭 ✓     │
├──────────────────┼──────────────┼──────────────┼──────────────────┤
│ 결정론적         │ ✗ 비결정론적  │ △ 근사        │ ✓ 완전           │
├──────────────────┼──────────────┼──────────────┼──────────────────┤
│ 지연 / 비용      │ ✗ API 호출   │ △ 모델 로딩   │ ✓ 없음           │
├──────────────────┼──────────────┼──────────────┼──────────────────┤
│ 단위 테스트 가능  │ ✗ 어려움     │ △ 어려움      │ ✓ 용이           │
├──────────────────┼──────────────┼──────────────┼──────────────────┤
│ 수정 용이성      │ △ 프롬프트    │ ✗ 재훈련 필요 │ ✓ 패턴 한 줄     │
├──────────────────┼──────────────┼──────────────┼──────────────────┤
│ 의미 파악        │ ✓ 우수        │ ✓ 우수        │ ✗ 제한적         │
└──────────────────┴──────────────┴──────────────┴──────────────────┘
```

---

## 3. 결정 B — 의존성 결정: 문장 간 순서를 어떻게 결정하는가?

타입이 결정된 후, 각 태스크가 이전 태스크를 기다려야 하는지(sequential) 또는 독립 실행 가능한지(parallel) 판단합니다.

```
예시:
  t1: explore  →  t2: analyze  →  "탐색 후 분석" → 자연스러운 순서 → sequential
  t1: create   →  t2: explore  →  "생성 후 탐색" → 비자연스러운 순서 → parallel
```

---

### 방법 B-1: LLM 기반 동적 의존성 예측

**동작 방식**: 문장 쌍을 LLM에게 보내서 "이 두 태스크는 순서가 있는가?"를 물어봅니다.

```
┌──────────────────────────────────────────────────────────────────┐
│  PROBLEM 1: 비결정론적 + 지연                                     │
│                                                                  │
│  문장 5개 = 4쌍의 관계 판단 = LLM 호출 4회 추가                  │
│  → 그래프 생성 단계에서만 총 9회 LLM 호출 발생                   │
├──────────────────────────────────────────────────────────────────┤
│  PROBLEM 2: DAG 보장 불가                                        │
│                                                                  │
│  LLM이 "t1→t2, t2→t3, t3→t1 모두 순서 있음"이라 응답할 수 있음  │
│  → 순환 그래프 생성 위험 (이후 DAGValidator가 거부하지만          │
│     그 전에 이미 비용 낭비)                                       │
└──────────────────────────────────────────────────────────────────┘
```

---

### 방법 B-2: 사용자 직접 지정

**동작 방식**: 사용자가 요청 시 `depends_on`을 명시합니다.

```
사용자 입력:
  "t1: 코드 탐색
   t2: 분석 (t1 완료 후)
   t3: 수정 (t2 완료 후)"
```

```
┌──────────────────────────────────────────────────────────────────┐
│  PROBLEM: 자동화의 목적을 상실                                    │
│                                                                  │
│  사용자가 자연어로 요청하는 이유는 의존성 관리를 시스템에         │
│  위임하기 위함 → 사용자가 직접 지정하면 자동화 의미 없음          │
└──────────────────────────────────────────────────────────────────┘
```

---

### 방법 B-3: FLOWS_TO 정적 전이 테이블 (선택된 방법) ✓

**동작 방식**: 타입 쌍의 자연스러운 흐름을 룩업 테이블로 사전 정의합니다.

```typescript
// TaskGraphProcessor.ts:149-158 실제 구현

FLOWS_TO = {
  explore:  ["explore", "analyze", "modify", "create", "validate", "plan", "document"],
  plan:     ["explore", "create", "execute", "document"],
  analyze:  ["explore", "analyze", "modify", "validate", "document", "create", "plan"],
  create:   ["validate", "modify", "document", "execute"],
  modify:   ["analyze", "validate", "document", "execute"],
  validate: ["explore", "analyze", "document", "execute", "modify"],
  execute:  ["explore", "analyze", "validate", "document", "plan", "create"],
  document: [],  // terminal — 이후 어떤 타입도 자연스럽게 따라오지 않음
}
```

### 시각화 — FLOWS_TO 결정 흐름

```
입력: sentences = ["Explore the codebase", "Analyze patterns", "Create a fix"]
      types     = ["explore",              "analyze",          "create"       ]

[t2 depends_on 결정]
  prev = "explore",  curr = "analyze"
  FLOWS_TO["explore"].includes("analyze") → true  → depends_on: ["t1"] ✓

[t3 depends_on 결정]
  prev = "analyze",  curr = "create"
  FLOWS_TO["analyze"].includes("create")  → true  → depends_on: ["t2"] ✓

결과 그래프:
  t1(explore) ──► t2(analyze) ──► t3(create)
  [순차 실행]
```

```
입력: sentences = ["Create a module", "Explore the codebase"]
      types     = ["create",          "explore"             ]

[t2 depends_on 결정]
  prev = "create",  curr = "explore"
  FLOWS_TO["create"].includes("explore") → false → depends_on: [] ✓

결과 그래프:
  t1(create)    t2(explore)
  [병렬 실행 — 서로 독립]
```

### FLOWS_TO 설계 원칙 시각화

```
[자연스러운 흐름 — sequential]

  plan ──────────────────────────────► create
  explore ───────────────────────────► analyze
  analyze ───────────────────────────► modify / create / validate
  create  ───────────────────────────► validate / execute
  modify  ───────────────────────────► validate / execute
  validate ──────────────────────────► explore (재탐색 필요 시)
  * ─────────────────────────────────► document  (항상 문서화 가능)

[비자연스러운 흐름 — parallel]

  create  ──X──► explore  (생성 후 탐색은 독립)
  validate ──X──► create   (검증 후 생성은 독립)
  document ──X──► *         (문서화는 terminal — 이후 없음)
```

### 왜 이 방식을 선택했나

```
┌──────────────────────────────────────────────────────────────────┐
│  BENEFIT 1: O(1) 조회                                            │
│                                                                  │
│  FLOWS_TO[prev]?.includes(curr) — 추가 LLM 호출 없음             │
│  → 그래프 생성 전체가 단일 동기 함수로 완료                       │
├──────────────────────────────────────────────────────────────────┤
│  BENEFIT 2: 결정론적 + 테스트 가능                               │
│                                                                  │
│  explore → analyze 는 항상 sequential                            │
│  → 테스트 케이스로 모든 전이를 고정 가능                          │
├──────────────────────────────────────────────────────────────────┤
│  BENEFIT 3: TYPE_DEFINITION.md와 동기화                          │
│                                                                  │
│  코드 주석: "Dependency transitions should stay aligned          │
│             with docs/TYPE_DEFINITION.md" (line 31)              │
│  → 타입 의미 정의와 전이 규칙이 같은 문서에서 관리됨              │
└──────────────────────────────────────────────────────────────────┘
```

**설계 근거**: Jurafsky & Martin (2009) *"Speech and Language Processing"*, Prentice Hall, Ch. 2
> 유한 상태 전이 시스템(finite-state transducer)은 도메인이 닫혀 있고 전이 규칙을 사전 열거할 수 있을 때, O(1) 조회로 결정론적 분류를 보장한다. FLOWS_TO 테이블은 8가지 태스크 타입 간 전이 관계를 열거한 유한 전이 행렬(transition matrix)로, 이 원칙의 직접 구현이다.

---

### 의존성 결정 방법 비교

```
┌──────────────────┬──────────────┬──────────────┬──────────────────┐
│ 기준             │ LLM 예측      │ 사용자 지정   │ FLOWS_TO 테이블 ✓│
├──────────────────┼──────────────┼──────────────┼──────────────────┤
│ 결정론적         │ ✗            │ ✓            │ ✓                │
├──────────────────┼──────────────┼──────────────┼──────────────────┤
│ 추가 LLM 호출    │ ✗ 필요       │ ✓ 없음        │ ✓ 없음           │
├──────────────────┼──────────────┼──────────────┼──────────────────┤
│ 사용자 부담      │ ✓ 없음       │ ✗ 큼          │ ✓ 없음           │
├──────────────────┼──────────────┼──────────────┼──────────────────┤
│ DAG 사이클 방지  │ ✗ 보장 없음  │ △ 사용자 책임  │ ✓ 구조적 보장    │
├──────────────────┼──────────────┼──────────────┼──────────────────┤
│ 단위 테스트 가능  │ ✗            │ ✓            │ ✓                │
└──────────────────┴──────────────┴──────────────┴──────────────────┘
```

---

## 4. 전체 그래프 생성 흐름

```
사용자 입력: "코드베이스를 탐색하고, 버그를 분석해서, 수정한 뒤 테스트해줘"
                │
                ▼ (Role 1 + TaskSentenceSplitter)
sentences = ["Explore the codebase",
             "Analyze the bugs",
             "Fix the issues",
             "Run the tests"]
                │
                ▼ [결정 A] classifyType()  ← Regex 키워드 매칭
types     = ["explore", "analyze", "modify", "validate"]
                │
                ▼ [결정 B] resolveDependsOn()  ← FLOWS_TO 테이블
  t1: depends_on []          (첫 번째는 항상 독립)
  t2: FLOWS_TO["explore"].includes("analyze") → true  → ["t1"]
  t3: FLOWS_TO["analyze"].includes("modify")  → true  → ["t2"]
  t4: FLOWS_TO["modify"].includes("validate") → true  → ["t3"]
                │
                ▼ TaskGraphSchema.parse()
TaskGraph = {
  tasks: [
    { id: "t1", type: "explore",  depends_on: []     },
    { id: "t2", type: "analyze",  depends_on: ["t1"] },
    { id: "t3", type: "modify",   depends_on: ["t2"] },
    { id: "t4", type: "validate", depends_on: ["t3"] },
  ]
}
                │
                ▼ DAGValidator → DependencyResolver → ParallelClassifier
                  (DAG_TOPOLOGICAL_SORT_RATIONALE.md 참고)
```

---

## 5. 결론

```
Role 2.1의 태스크 그래프 생성은 두 가지 결정론적 전략을 조합한다.

타입 분류에는 LLM 호출 없이 결정론적으로 동작하는 정규식 키워드
First-match 분류기 (Manning et al., 2008)를 채택했다. LLM 기반 분류는
비결정론적이고 분류 단계에서 API 비용이 발생하며 단위 테스트가
어렵다는 문제가 있어 제외했다.

의존성 결정에는 타입 전이 관계를 사전 정의한 FLOWS_TO 정적 테이블
(Jurafsky & Martin, 2009의 유한 상태 전이 시스템 원칙 기반)을 채택했다. LLM 동적 예측은
비결정론적 + 추가 호출 비용 문제가 있고, 사용자 직접 지정은 자동화
목적을 상실한다.

두 전략 모두 "결정론적, 비용 없음, 단위 테스트 가능"이라는 공통 원칙
아래 선택되었으며, 이는 이후 DAGValidator가 그래프를 사전 검증할 수
있는 기반이 된다.
```

---

## 6. 참고 문헌

| 저자 | 연도 | 제목 | 출판 |
|------|------|------|------|
| Manning, C. et al. | 2008 | Introduction to Information Retrieval, Ch. 13 | *Cambridge University Press* |
| Jurafsky, D. & Martin, J.H. | 2009 | Speech and Language Processing, Ch. 2 (Finite-State Transducers) | *Prentice Hall* |
| Bird, S. et al. | 2009 | Natural Language Processing with Python, Ch. 6 (Rule-based classifiers) | *O'Reilly* |

---

## 7. 관련 구현 파일

```
src/core/task-graph/
├── TaskGraphProcessor.ts   ← TYPE_PATTERNS, FLOWS_TO, classifyType(), resolveDependsOn()
└── TaskSentenceSplitter.ts ← 문장 분리 (이 문서의 입력을 만드는 단계)

docs/
└── TYPE_DEFINITION.md      ← 8가지 타입의 의미 정의 (FLOWS_TO와 동기화)
```
