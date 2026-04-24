# detoks Testing Guide

## 목적
- detoks 프로젝트 전체에서 작업 단위별로 어떤 테스트를 우선 돌릴지 빠르게 판단하기 위한 기준 문서
- 작은 work unit에 맞는 검증 범위를 유지하기 위한 공통 원칙

## 적용 범위
- CLI parse / format / REPL
- executor / adapter / subprocess 경계
- task graph / validator / resolver
- context / state 로직
- TypeScript 기반 smoke / integration / unit test

## 현재 기본 도구
- 테스트 러너: `vitest`
- 타입 검증: `tsc --noEmit`

기본 명령:

```bash
rtk npm test
rtk npm run typecheck
```

파일 단위 실행:

```bash
rtk npm test -- tests/ts/unit/cli/parse.test.ts
rtk npm test -- tests/ts/integration/cli-smoke.test.ts
```

---

## 테스트 종류

### 1. Unit test
대상:
- CLI parse / format
- executor / adapter / subprocess 경계
- task graph / validator / resolver
- context / state 로직

특징:
- 가장 먼저 추가/수정할 기본 테스트
- 외부 실행보다 함수/모듈 단위 계약을 고정
- 빠르게 돌려서 work unit 검증에 적합

예시:
- `tests/ts/unit/cli/parse.test.ts`
- `tests/ts/unit/core/executor/execute.test.ts`

### 2. Integration / smoke test
대상:
- 실제 CLI 엔트리 진입
- REPL 시작/종료
- one-shot 실행 출력
- 여러 모듈 경계를 함께 타는 짧은 시나리오

특징:
- 얇고 안정적으로 유지
- 외부 의존성은 최소화
- 회귀 방지용으로만 필요한 최소 범위 유지

예시:
- `tests/ts/integration/cli-smoke.test.ts`

### 3. Typecheck
대상:
- 모든 TS 작업

특징:
- 기능 테스트와 별개로 항상 실행
- fixture 누락, 타입 계약 깨짐, 경로 문제를 빨리 잡음

명령:

```bash
rtk npm run typecheck
```

---

## 작업 유형별 권장 검증

### CLI help / parse / output UX 작업
- 관련 unit test
- 필요 시 CLI smoke test
- typecheck

권장 예:

```bash
rtk npm test -- tests/ts/unit/cli/parse.test.ts
rtk npm run typecheck
```

### REPL / 실제 출력 흐름 작업
- 관련 smoke test
- 관련 unit test
- typecheck

권장 예:

```bash
rtk npm test -- tests/ts/integration/cli-smoke.test.ts
rtk npm run typecheck
```

### executor / adapter / subprocess 작업
- 관련 executor / adapter / runner unit test
- 필요 시 얇은 integration test
- typecheck

권장 예:

```bash
rtk npm test -- tests/ts/unit/core/executor/execute.test.ts
rtk npm run typecheck
```

### state / context / task graph 작업
- 관련 unit test
- 필요 시 기존 smoke 영향 확인
- typecheck

---

## 원칙

1. 작은 work unit에는 작은 테스트만 추가한다.
2. 먼저 unit test로 계약을 고정하고, 필요한 경우에만 smoke test를 추가한다.
3. smoke test는 실제 사용자 흐름을 얇게 확인하는 수준으로 유지한다.
4. 외부 바이너리/환경 의존 테스트는 최소화한다.
5. 모든 TS 변경은 `typecheck`를 함께 돌린다.

---

## 요약

- 기본은 `Vitest + typecheck`
- 로직/계약 변화는 unit test 우선
- 사용자 흐름 회귀 방지는 얇은 smoke test
- 큰 범위 테스트보다 work unit에 맞는 최소 검증을 선호
