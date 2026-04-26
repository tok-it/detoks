# 태스크 실패 전파 전략 선택 근거

> 발표 자료용 — 처음 보는 사람도 이해할 수 있도록 작성되었습니다.

---

## 1. 문제 상황

DAG 위상 정렬로 실행 순서가 결정된 뒤, 파이프라인이 실행 중에 어떤 태스크가 실패하면 어떻게 해야 할까?

```
t1(explore) ──► t2(analyze) ──► t3(modify) ──► t4(validate)

만약 t2(analyze)가 실패하면?
  t3는 t2의 결과가 필요한데...
  t4는 t3의 결과가 필요한데...
```

세 가지 전략을 비교합니다.

---

## 2. 전략 비교

### 전략 1: Graceful Degradation (부분 성공)

실패한 태스크를 건너뛰고 나머지를 계속 실행합니다.

```
t2 실패 → t3을 "t2 없이" 실행 시도 → t4도 실행 시도

[결과]
  t1: completed
  t2: failed
  t3: completed (하지만 t2 결과 없이 실행된 불완전한 결과)
  t4: completed (하지만 t3이 불완전해서 의미 없음)
```

```
문제: t3의 "성공"은 가짜 성공
     t2의 분석 없이 "수정"이 완료된 것처럼 보이지만
     실제로는 의미 없는 결과이거나 더 나쁜 부작용 가능
```

---

### 전략 2: 보상 트랜잭션 / Rollback (되돌리기)

실패 시 이미 실행된 태스크의 결과를 되돌립니다.

```
t2 실패 → t1의 결과도 취소

[개념적 흐름]
  t1: completed → rolled back
  t2: failed
  t3, t4: 실행되지 않음
```

```
문제: LLM 기반 코드 작업에서 "되돌리기"는 정의하기 어려움
     "파일을 만들었다"는 되돌릴 수 있어도
     "LLM이 내린 판단"은 되돌릴 수 없음
     → 분산 시스템의 saga 패턴은 각 단계에 보상 로직 정의 필요
       (Garcia-Molina & Salem, 1987)
```

---

### 전략 3: Strict Cascade (선택된 방법) ✓

실패한 태스크에 의존하는 모든 후속 태스크를 즉시 `skipped`로 처리합니다.

```typescript
// orchestrator.ts:185-192 실제 구현

const blockedBy = task.depends_on.find((depId) => failedTaskIds.has(depId));
if (blockedBy) {
  failedTaskIds.add(task.id);
  taskRecords.push({ taskId: task.id, status: "skipped", rawOutput: "", blockedBy });
  continue;
}
```

### 시각화 — Strict Cascade

```
t1(explore) ──► t2(analyze) ──► t3(modify) ──► t4(validate)

t2 실패 시:
  t1: ✓ completed
  t2: ✗ failed         ← failedTaskIds에 추가
  t3: ⊘ skipped        ← blockedBy: "t2" 기록
  t4: ⊘ skipped        ← blockedBy: "t3" 기록 (전파)

최종 실행 기록:
  { taskId: "t3", status: "skipped", blockedBy: "t2" }
  { taskId: "t4", status: "skipped", blockedBy: "t3" }
```

---

## 3. 세 전략 비교

```
┌──────────────────────┬────────────────┬─────────────┬─────────────────┐
│ 기준                  │ Graceful       │ Rollback    │ Strict Cascade ✓│
├──────────────────────┼────────────────┼─────────────┼─────────────────┤
│ 가짜 성공 방지        │ ✗ 발생 가능    │ ✓           │ ✓               │
├──────────────────────┼────────────────┼─────────────┼─────────────────┤
│ 에러 원인 명시        │ ✗ 불명확       │ △           │ ✓ blockedBy 기록│
├──────────────────────┼────────────────┼─────────────┼─────────────────┤
│ 구현 복잡도          │ 낮음           │ 높음        │ 낮음            │
├──────────────────────┼────────────────┼─────────────┼─────────────────┤
│ LLM 작업에 적용 가능  │ △ 위험        │ ✗ 어려움    │ ✓               │
└──────────────────────┴────────────────┴─────────────┴─────────────────┘
```

---

## 4. 결론

```
detoks는 태스크 실패 시 Strict Cascade 전략을 채택했다.

Graceful Degradation은 의존성이 충족되지 않은 상태에서 태스크가
"성공"으로 기록될 수 있어 결과의 신뢰성을 보장할 수 없다.

보상 트랜잭션(Garcia-Molina & Salem, 1987)은 이론적으로 완결성이
높지만, LLM 기반 코드 작업에서 "되돌리기"의 의미를 정의하기 어렵고
각 태스크 타입마다 보상 로직을 별도로 구현해야 한다.

Strict Cascade는 실패한 의존성이 있는 태스크를 즉시 skipped로
처리하고 blockedBy를 기록하여, 실패 원인을 명확히 추적하면서
불완전한 결과가 성공으로 오인되는 것을 방지한다.
이는 Erlang의 "let it crash" 철학 (Armstrong, 2003)과 같이,
모호한 부분 성공보다 명확한 조기 실패가 시스템 신뢰성에 유리하다는
원칙에 기반한다.
```

---

## 5. 참고 문헌

| 저자 | 연도 | 제목 | 출판 |
|------|------|------|------|
| Garcia-Molina, H. & Salem, K. | 1987 | Sagas | *ACM SIGMOD Record* |
| Armstrong, J. | 2003 | Making reliable distributed systems in the presence of software errors (PhD thesis) | *Royal Institute of Technology* |
| Nygard, M. | 2007 | Release It! (Ch. 5 — Stability Patterns) | *Pragmatic Bookshelf* |

---

## 6. 관련 구현 파일

```
src/core/pipeline/
└── orchestrator.ts   ← failedTaskIds, blockedBy 구현 (Step 6 실행 루프)
```
