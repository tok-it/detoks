# Role 1 파이프라인 개선 요구사항

## 목적

`tmp/role1-row-result.json` 분석 결과를 바탕으로 Role 1 파이프라인의 품질 결함과 개선 요구사항을 구현 관점에서 정리한다.

이 문서는 다음 범위에 한정한다.

- Role 1 번역 결과 검증
- protected segment masking / restore
- prompt compression 안전성
- batch 검증 결과 집계
- Role 1 회귀 테스트 보강

다음은 범위에서 제외한다.

- Role 2.1 request classification 변경
- task graph 구조 변경
- executor / runtime orchestration 변경

## 배경

`tmp/role1-row-result.json` 기준 요약은 다음과 같다.

- `completed_count: 106`
- `failed_count: 0`
- `average_inference_time_sec: 0.577`
- `average_token_reduction_rate: 32.182`

겉보기 성공률은 높지만, 개별 결과를 보면 검증 누락과 의미 손실이 존재한다.

대표 사례:

- `index 12`
  - 한글이 결과에 남아 있는데도 `validation_errors=[]`, `status=completed`
- `index 71`
  - `I/O bound`가 `bounded task`로 변형됨
- `index 76`
  - `matplotlib.pyplot.scatter` 의미가 문장 구조에 흡수됨
- `index 85`
  - `numpy.dot(A, B)`에서 핵심 API 식별자가 사라짐
- `index 99`
  - `unittest.mock.patch`가 잘못된 의미 구조로 재배치됨
- `index 102`
  - `RandomForestRegressor` 관련 번역이 깨지고 의미가 오염됨
- `index 104`
  - `threading.Event`와 `'GO'` 신호의 관계가 잘못 복원됨

## 핵심 문제 정의

### 1. 최종 결과 검증 누락

현재 최종 `restoredText`에 대해 validator를 다시 적용하지 않아, span 단계에서는 없던 오류가 최종 결과에서 발생해도 누락될 수 있다.

영향:

- 실제 오류가 있어도 batch 결과가 `completed`로 기록될 수 있다.
- `failed_count=0`가 품질 신호로서 약해진다.

### 2. 보호 대상 토큰 보존 범위 부족

현재 masking 규칙은 code/path/filename/numeric token 중심이다.  
하지만 실제 오류는 다음 유형에서 반복된다.

- dotted identifier
- qualified class / module path
- 함수 호출식
- slash 기반 토큰 (`I/O`, `blue/green`)
- 라이브러리 API 표현식

영향:

- 번역기 또는 압축기에서 핵심 API 명칭이 오염된다.
- Role 2.1에 전달되는 `compiled_prompt` 의미가 바뀔 수 있다.

### 3. repair가 형식 복구에 치우쳐 있음

현재 repair는 placeholder 형식과 순서 복구에는 유효하지만, 의미 보존 실패까지 막지 못한다.

영향:

- `repair_actions`가 남아도 결과 품질이 보장되지 않는다.
- 사용자 관점에서는 고쳐진 것처럼 보여도 실제 의미는 틀릴 수 있다.

### 4. 압축 지표와 품질 지표가 섞여 있음

현재 `average_token_reduction_rate`는 `raw_input -> compiled_prompt` 기준이라 번역 효과와 압축 효과가 분리되지 않는다.

영향:

- 압축기 성능을 과대평가할 수 있다.
- `normalized_input == compiled_prompt`인 경우에도 압축이 잘 된 것처럼 보일 수 있다.

### 5. 회귀 테스트 부족

현재 테스트는 placeholder 복구와 기본 압축 동작 중심이다.  
실제 실패 사례를 직접 고정하는 테스트가 부족하다.

영향:

- 동일한 품질 회귀가 다시 발생할 가능성이 높다.
- 문서상 보존 규칙과 실제 동작 간 괴리가 누적된다.

## 개선 요구사항

### 요구사항 1. 최종 복원 후 재검증 추가

해야 할 일:

- `restore_placeholders()` 이후 최종 텍스트에 대해 `validate_translation()`를 다시 수행한다.
- 최종 `validation_errors`는 span-level 오류 재사용이 아니라 최종 결과 기준으로 산출한다.
- 최종 결과에 오류가 있으면 batch item을 `failed`로 기록한다.

수용 기준:

- 한글이 남은 결과는 `korean_text_remaining` 또는 동등한 오류로 기록된다.
- 최종 결과에 required term 누락, placeholder mismatch가 있으면 `completed`가 되지 않는다.

### 요구사항 2. masking 보호 범위 확장

해야 할 일:

- 다음 토큰 유형을 보호 구간 후보로 추가하거나 우선순위를 높인다.
  - dotted identifier
  - qualified module path
  - 함수 호출식
  - slash token
  - 라이브러리 API 표현식
- `numpy.dot(A, B)`, `unittest.mock.patch`, `threading.Event`, `matplotlib.pyplot.scatter` 같은 형태를 통째로 보존할 수 있게 한다.

수용 기준:

- 보호 대상 토큰이 번역 단계에서 부분 유실되지 않는다.
- 복원 후 API/식별자 문자열이 원문과 동일하게 유지된다.

### 요구사항 3. 의미 보존 검증 강화

해야 할 일:

- source에 포함된 핵심 protected token이 output에도 그대로 존재하는지 검사한다.
- 필요한 경우 정책 기반 `required_terms` 자동 생성 규칙을 확장한다.
- repair 이후에도 핵심 토큰이 누락되면 실패로 처리한다.

수용 기준:

- API 이름이 일반 명사나 설명 문구로 대체되면 validation 오류가 발생한다.
- 형식은 정상이어도 핵심 식별자 누락 시 통과하지 않는다.

### 요구사항 4. 압축 fallback 기준 보강

해야 할 일:

- 압축 결과가 의미를 바꾸거나 핵심 action signal을 약화시키면 `normalized_input` fallback 한다.
- 압축 안전성 판정에 protected token 보존 여부를 포함한다.

수용 기준:

- 과도한 축약으로 의미 손실이 발생한 케이스는 `compressed_with_nlp_adapter` 대신 fallback 된다.
- 압축 성공은 길이 절감이 아니라 의미 보존을 전제로 한다.

### 요구사항 5. 검증 지표 분리

해야 할 일:

- 검증 결과에 다음 지표를 분리해 기록한다.
  - `raw -> normalized` 토큰 변화율
  - `normalized -> compiled` 토큰 변화율
  - compression fallback 횟수
  - repair 발생 횟수
  - validation 실패 횟수

수용 기준:

- 번역 품질과 압축 품질을 서로 다른 수치로 확인할 수 있다.
- 평균 압축률이 실제 압축 동작을 과장하지 않는다.

### 요구사항 6. 실데이터 회귀 테스트 추가

해야 할 일:

- `row_data.json` 기반 실제 실패/오염 사례를 unit 또는 integration test로 고정한다.
- 최소한 다음 케이스를 회귀 테스트에 포함한다.
  - `index 12`
  - `index 71`
  - `index 76`
  - `index 85`
  - `index 99`
  - `index 102`
  - `index 104`

수용 기준:

- 위 케이스들이 다시 오염되면 테스트가 실패한다.
- 문서상 보호 규칙이 테스트로 연결된다.

## 우선순위

P0:

- 최종 복원 후 재검증 추가
- masking 보호 범위 확장
- 의미 보존 검증 강화

P1:

- 압축 fallback 기준 보강
- 실데이터 회귀 테스트 추가

P2:

- 검증 지표 분리

## 구현 대상 후보

- `src/core/translate/translate.ts`
- `src/core/translate/masking.ts`
- `src/core/guardrails/validator.ts`
- `src/core/guardrails/repair.ts`
- `src/core/prompt/compression.ts`
- `scripts/verify-role1.ts`
- `tests/ts/unit/core/guardrails`
- `tests/ts/unit/core/prompt`
- `tests/ts/integration`

## 비목표

- Role 1이 task decomposition 책임을 가져가는 변경
- Role 2.1 handoff schema 변경
- 대규모 리팩터링
- provider 구조 변경

## 작업 원칙

- 최소 변경 원칙을 유지한다.
- 기존 Role 1 책임 경계를 넘지 않는다.
- 문서에 있는 보존 규칙을 테스트로 고정한다.
- 지표 개선보다 검증 정확도 개선을 우선한다.
