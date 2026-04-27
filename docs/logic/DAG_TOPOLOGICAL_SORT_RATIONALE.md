# DAG 토폴로지컬 소트 선택 근거

> 발표 자료용 — 처음 보는 사람도 이해할 수 있도록 작성되었습니다.

---

## 1. 해결해야 하는 문제

사용자가 복잡한 요청을 보내면, detoks는 이를 여러 개의 **태스크(Task)**로 쪼갭니다.

예를 들어:

```
"코드베이스를 분석하고, 버그를 찾아서, 수정한 뒤 테스트를 실행해줘"
```

이 요청은 아래 4개의 태스크로 분해됩니다.

```
t1: 코드베이스 분석 (explore)
t2: 버그 탐색     (analyze)   — t1이 끝나야 시작 가능
t3: 코드 수정     (create)    — t2가 끝나야 시작 가능
t4: 테스트 실행   (validate)  — t3이 끝나야 시작 가능
```

**핵심 질문**: 이 태스크들을 어떤 순서로, 얼마나 안전하게 실행할 것인가?

이를 해결하는 방법이 바로 **정렬/스케줄링 알고리즘**이며,  
세 가지 방법을 비교합니다.

---

## 2. 비교 대상 3가지 방법

```
┌─────────────────────────────────────────────────────────────────┐
│  방법 1: Priority Queue      의존성을 숫자 우선순위로 표현       │
│  방법 2: Event-driven        태스크 완료 시 다음 태스크 trigger  │
│  방법 3: DAG Topological     그래프 전체를 실행 전에 검증 ✓     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 방법 1 — Priority Queue (우선순위 큐)

### 동작 원리

각 태스크에 숫자 점수를 부여하고, 점수가 높은 것부터 실행합니다.  
운영체제의 프로세스 스케줄러에서 주로 사용됩니다.

```
태스크에 숫자 부여:
  t1(explore)  → 우선순위: 3
  t2(analyze)  → 우선순위: 2
  t3(create)   → 우선순위: 1
  t4(validate) → 우선순위: 0

Max-Heap 정렬 결과: t1 → t2 → t3 → t4
```

### 시각화 — Priority Queue

```
[heap 내부 상태]

        t1(3)
       /     \
    t2(2)   t3(1)
    /
  t4(0)

pop 순서: t1 → t2 → t3 → t4
```

### 문제점

```
┌──────────────────────────────────────────────────────────────────┐
│  PROBLEM 1: 의존성을 표현하지 못한다                              │
│                                                                  │
│  t2 depends_on t1 이라는 관계를 숫자로 인코딩하려면              │
│  개발자가 직접 "t2의 우선순위는 t1보다 낮게 설정"을 계산해야 함  │
│  → 태스크가 동적으로 생성되면 매번 수동 계산 필요                 │
├──────────────────────────────────────────────────────────────────┤
│  PROBLEM 2: 순환 의존성을 미리 감지할 수 없다                    │
│                                                                  │
│  t1 → t2 → t3 → t1  (순환!)                                     │
│  → 이 상황을 실행하기 전에 탐지하는 메커니즘이 없음               │
│  → 데드락 발생 후에야 알 수 있음                                  │
├──────────────────────────────────────────────────────────────────┤
│  PROBLEM 3: 병렬 실행 그룹을 자동으로 계산할 수 없다             │
│                                                                  │
│  t2와 t3이 서로 독립적이어서 동시 실행 가능해도                  │
│  Priority Queue는 이를 자동으로 파악하지 못함                     │
└──────────────────────────────────────────────────────────────────┘
```

**학술 근거**: Liu & Layland (1973) *"Scheduling Algorithms for Multiprogramming in a Hard-Real-Time Environment"*, JACM
> 우선순위 스케줄링은 **독립적인 태스크**를 전제로 설계되었으며, 태스크 간 의존성 그래프를 직접 다루지 않는다.

---

## 4. 방법 2 — Event-driven / Forward-chaining (반응형 실행)

### 동작 원리

태스크가 완료되면 다음 태스크를 자동으로 시작시킵니다.  
Makefile, Apache Airflow 초기 구조, RxJS가 이 방식을 사용합니다.

```
t1 완료 → "t1 완료" 이벤트 발생 → t2 시작
t2 완료 → "t2 완료" 이벤트 발생 → t3 시작
t3 완료 → "t3 완료" 이벤트 발생 → t4 시작
```

### 시각화 — Event-driven

```
[실행 중 상태]

  t1 ──[완료 이벤트]──► t2 ──[완료 이벤트]──► t3 ──[완료 이벤트]──► t4
  ✓                     ✓                     ✓                    (실행 중)

  실행 전 전체 구조를 알 수 없음 — 한 칸씩 앞을 봄
```

### 문제점

```
┌──────────────────────────────────────────────────────────────────┐
│  PROBLEM 1: 실행 전 그래프 검증이 불가능하다                      │
│                                                                  │
│  t3 → t99 (존재하지 않는 태스크)                                  │
│  → t3이 완료되고 나서야 "t99가 없다"는 에러 발생                  │
│  → 전체 파이프라인이 반쯤 실행된 후에 실패                        │
├──────────────────────────────────────────────────────────────────┤
│  PROBLEM 2: 순환 의존성은 무한 대기로 이어진다                   │
│                                                                  │
│  t1 → t2 → t3 → t1  (순환)                                      │
│                                                                  │
│  t1 완료 이벤트 대기 ◄──────────────────────┐                   │
│       │                                     │                   │
│       ▼                                     │                   │
│  t2 실행 → t3 실행 → t1 시작 대기 ──────────┘                   │
│                                                                  │
│  → 영원히 끝나지 않음. 실행 전에 탐지 불가.                       │
├──────────────────────────────────────────────────────────────────┤
│  PROBLEM 3: 병렬 실행 가능 그룹을 미리 계산할 수 없다            │
│                                                                  │
│  각 이벤트가 발생할 때마다 "지금 무엇을 실행할 수 있나?"를         │
│  그때그때 판단 — 전체 최적 실행 계획을 만들 수 없음               │
└──────────────────────────────────────────────────────────────────┘
```

**학술 근거**: Feldman (1979) *"Make — A Program for Maintaining Computer Programs"*, Software: Practice and Experience
> Make는 Makefile에 **정적으로 선언된** 의존성을 처리하는 시스템으로, 동적으로 생성되는 의존성 그래프를 지원하지 않는다. detoks처럼 요청마다 그래프 구조가 달라지는 환경에서는, 정적 선언 방식을 적용할 수 없어 실행 시점 trigger에 의존하게 되며, 이 경우 사전 구조 검증이 불가능하다.

---

## 5. 방법 3 — DAG Topological Sort (선택된 방법)

### 핵심 아이디어

> **실행하기 전에 전체 그래프를 한 번에 검증하고, 최적 실행 순서를 계산한다.**

태스크들을 **DAG (방향 비순환 그래프, Directed Acyclic Graph)**로 모델링하고,  
**Kahn's Algorithm**으로 위상 정렬합니다.

### DAG란 무엇인가?

```
DAG의 두 가지 조건:
  1. 방향(Directed)  — 의존성에 방향이 있음 (t1이 완료되어야 t2 시작)
  2. 비순환(Acyclic) — 순환 고리가 없음 (t1 → t2 → t1 불가)

[올바른 DAG 예시]                  [DAG가 아닌 예시 - 순환 존재]

  t1 ──► t2 ──► t4                  t1 ──► t2
   \            ▲                         │
    \           │                         ▼
     ──► t3 ───┘                    t3 ◄── t1  ← 순환! (CYCLE_DETECTED)
```

### Kahn's Algorithm 동작 방식

```
[in-degree란?]
  어떤 태스크에 들어오는 의존성 화살표의 수

  t1 ──► t2 ──► t4
   \            ▲
    ──► t3 ───┘

  in-degree: t1=0, t2=1, t3=1, t4=2

[알고리즘 단계별 실행]

  Step 1: in-degree가 0인 태스크 큐에 넣기
          큐: [t1]

  Step 2: t1 꺼내기 → 결과에 추가, t1의 자식(t2, t3)의 in-degree 감소
          결과: [t1]
          큐:   [t2, t3]  (t2: 0, t3: 0)

  Step 3: t2 꺼내기 → t4의 in-degree 감소 (2→1)
          결과: [t1, t2]
          큐:   [t3]

  Step 4: t3 꺼내기 → t4의 in-degree 감소 (1→0), t4를 큐에 추가
          결과: [t1, t2, t3]
          큐:   [t4]

  Step 5: t4 꺼내기
          결과: [t1, t2, t3, t4]  ← 최종 실행 순서!
```

### detoks에서의 3단계 파이프라인

```
사용자 요청
    │
    ▼
┌───────────────────────────────────────────┐
│  Step 1: DAGValidator                     │
│                                           │
│  ① UNKNOWN_DEPENDENCY 검사                │
│     "depends_on에 없는 태스크 ID가 있나?" │
│                                           │
│  ② CYCLE_DETECTED 검사                    │
│     "순환 의존성이 있나?" (DFS 색칠)       │
│                                           │
│  ③ DISCONNECTED_NODE 검사                 │
│     "고립된 태스크가 있나?"               │
│                                           │
│  ④ 위상 정렬 계산 (Kahn's Algorithm)      │
│     → topologicalOrder: [t1, t2, t3, t4] │
└───────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────┐
│  Step 2: DependencyResolver               │
│                                           │
│  ID 배열 [t1, t2, t3, t4]                │
│      →  실제 Task 객체로 변환             │
│  depends_on: ["t1"] → Task 객체 참조      │
└───────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────┐
│  Step 3: ParallelClassifier               │
│                                           │
│  독립적인 태스크를 같은 stage로 묶기      │
│                                           │
│  stage 0: [t1]         ← 의존성 없음     │
│  stage 1: [t2, t3]     ← t1만 기다림     │
│  stage 2: [t4]         ← t2, t3 기다림   │
└───────────────────────────────────────────┘
    │
    ▼
Orchestrator: stage 0 → stage 1 (병렬) → stage 2
```

### 병렬 실행 시각화

병렬 효과를 보려면 독립 태스크가 존재하는 구조가 필요합니다.  
아래는 t1 → {t2, t3} → t4 형태의 다이아몬드 그래프 예시입니다.

```
[그래프 구조]

  t1 ──► t2 ──► t4
   \            ▲
    ──► t3 ─────┘

  t2와 t3은 모두 t1만 기다리므로 동시 실행 가능

[ParallelClassifier 없이 단순 직렬 실행]

  t1 → t2 → t3 → t4
  1초   1초   1초   1초  = 총 4초

[ParallelClassifier 적용 후 — stage 기반 실행]

  stage 0     stage 1          stage 2
  ┌────┐    ┌────┐┌────┐      ┌────┐
  │ t1 │───►│ t2 ││ t3 │─────►│ t4 │
  └────┘    └────┘└────┘      └────┘
   1초        1초(동시)          1초   = 총 3초
```

**학술 근거**: Kahn (1962) *"Topological sorting of large networks"*, Communications of the ACM
> in-degree 기반 알고리즘은 O(V+E) 시간에 전체 그래프를 처리하며, **실행 전 완전성 보장**이 핵심 장점이다.

**학술 근거**: Hu (1961) *"Parallel Sequencing and Assembly Line Problems"*, Operations Research
> DAG의 각 노드를 의존성 깊이(level) 기준으로 stage에 배치하는 방식이, 단위 시간 태스크 환경에서 최소 실행 시간을 보장하는 최적 스케줄임을 증명한다. ParallelClassifier의 `stage = max(deps' stages) + 1` 규칙은 이 level-based scheduling의 직접 구현이다.

---

## 6. 3가지 방법 최종 비교

```
┌─────────────────────────┬──────────────────┬──────────────────┬──────────────────┐
│ 요구사항                 │ Priority Queue   │ Event-driven     │ DAG Topo Sort ✓  │
├─────────────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ 의존성 관계 표현         │ 수동 숫자 계산    │ 암묵적 trigger   │ depends_on 명시  │
├─────────────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ 순환 감지 (실행 전)      │ 불가             │ 불가             │ O(V+E) 사전 감지 │
├─────────────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ 없는 태스크 ID 감지      │ 불가             │ 런타임에만       │ 실행 전 감지     │
├─────────────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ 병렬 stage 계산          │ 불가             │ 불가             │ ParallelClassifier│
├─────────────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ 에러 원인 명시           │ 어려움           │ 런타임 에러      │ CYCLE_DETECTED   │
│                         │                  │                  │ UNKNOWN_DEPENDENCY│
│                         │                  │                  │ DISCONNECTED_NODE │
├─────────────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ 시간 복잡도              │ O(n log n)       │ O(E) per event   │ O(V+E) 전체      │
└─────────────────────────┴──────────────────┴──────────────────┴──────────────────┘
```

---

## 7. 결론 — 왜 DAG Topological Sort인가

```
본 시스템은 태스크 실행 순서 결정에 DAG 토폴로지컬 소트 (Kahn, 1962)를 채택했다.

대안으로 고려한 Priority Queue 기반 스케줄링 (Liu & Layland, 1973)은
독립 태스크를 전제로 설계되어 depends_on 의존성을 정확히 표현하지 못하며,
순환 의존성을 실행 전에 탐지할 수 없다.

Event-driven 방식 (Feldman, 1979)은 반응형 trigger 구조로 순환 감지 및
병렬 stage 사전 계산이 불가능하여, 실행 중 데드락이 발생하기 전까지
에러 원인을 특정하기 어렵다.

반면 Kahn's Algorithm은 O(V+E) 복잡도로 전체 그래프를 실행 전에 검증하고,
Coffman & Graham (1972)의 병렬 스케줄링 이론에 따라 최적 병렬 stage를 계산한다.

이는 detoks의 DAGValidator → DependencyResolver → ParallelClassifier
파이프라인으로 구현되어, 세 가지 구조적 오류를 실행 전에 명확히 분류한다.
```

---

## 8. 참고 문헌

| 저자 | 연도 | 제목 | 출판 |
|------|------|------|------|
| Kahn, A.B. | 1962 | Topological sorting of large networks | *Communications of the ACM* |
| Liu, C.L. & Layland, J.W. | 1973 | Scheduling Algorithms for Multiprogramming in a Hard-Real-Time Environment | *Journal of the ACM* |
| Hu, T.C. | 1961 | Parallel Sequencing and Assembly Line Problems | *Operations Research, 9(6)* |
| Feldman, S.I. | 1979 | Make — A Program for Maintaining Computer Programs | *Software: Practice and Experience* |
| Cormen et al. | 2009 | Introduction to Algorithms (3rd ed.), Ch. 22.4 Topological sort | MIT Press |

---

## 9. 관련 구현 파일

```
src/core/task-graph/
├── DAGValidator.ts         ← Kahn's Algorithm 구현, 3가지 에러 타입 감지
├── DependencyResolver.ts   ← ID 배열 → Task 객체 변환
└── ParallelClassifier.ts   ← 병렬 실행 stage 계산

src/core/pipeline/
└── orchestrator.ts         ← 위 3단계를 순서대로 호출, stage별 실행

tests/ts/unit/core/task-graph/
├── DAGValidator.test.ts
├── DependencyResolver.test.ts
└── ParallelClassifier.test.ts
```
