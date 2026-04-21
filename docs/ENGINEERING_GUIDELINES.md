# 🛠 Engineering Guidelines

## 1. Core Principles

- Models interpret intent and meaning.
- Code controls execution and state.
<!-- 한국어 설명: 모델은 요청의 의미를 해석하고, 실제 실행 흐름과 상태 통제는 코드가 담당해야 합니다. -->

---

## 2. Architecture Rules

- Model calls must be isolated to a single layer.
- State must have a single source of truth.
- The CLI must not contain business logic.
<!-- 한국어 설명: 모델 호출 위치를 한 계층으로 제한하고, 상태의 원천은 하나로 유지하며, CLI는 입출력만 담당해야 합니다. -->

---

## 3. Code Rules

- Type definitions are required.
- JSON validation must be enforced.
- Errors must be handled explicitly.
<!-- 한국어 설명: 타입 정의, JSON 검증, 명확한 에러 처리는 안정적인 시스템 동작을 위한 필수 규칙입니다. -->

---

## 4. Collaboration Rules

- Define interfaces first.
- Keep pull requests small.
- Reach agreement before changing schemas.
<!-- 한국어 설명: 협업 시에는 인터페이스를 먼저 정하고, 작은 단위로 변경하며, 스키마 변경은 사전 합의를 거쳐야 합니다. -->

---

## 5. Performance Principles

- Minimize token usage.
- Eliminate duplication.
- Execute only the work that is necessary.
<!-- 한국어 설명: 성능 최적화의 핵심은 토큰 사용 최소화, 중복 제거, 필요한 작업만 실행하는 것입니다. -->

---

## 6. Prohibited Practices

- Using model outputs without validation ❌
- Changing schemas arbitrarily ❌
- Managing duplicated state ❌
<!-- 한국어 설명: 검증 없는 모델 결과 사용, 임의 스키마 변경, 중복 상태 관리는 모두 금지해야 합니다. -->

---

## Core Principle

> The model interprets, and the code controls.
<!-- 한국어 설명: 시스템의 최종 통제권은 코드에 있고, 모델은 해석 역할에 집중해야 한다는 원칙입니다. -->
