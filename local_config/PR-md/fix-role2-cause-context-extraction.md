# PR: Role 2.1 실제 LLM 번역 표현 기반 태스크 후보 보강

## 요약

이 PR은 실제 llama + Kompress 경로에서 확인된 Role 2.1 태스크 후보 추출/분류 취약점을 보강합니다.

기존 hybrid 구조는 담화 표현이 섞인 5개 작업 요청을 처리할 수 있었지만, 실제 LLM 번역 결과에서는 정규 테스트 문장과 다른 표현이 나왔습니다. 이 PR은 그 표현들을 기준으로 cause context 보존, 진행 메타 제거, trace/explain 분석 분류, work note 문서화 분류를 보강합니다.

```text
Korean prompt
-> live llama translation
-> normalized Role 2 handoff
-> TaskCandidateExtractor
-> TaskGraphProcessor
-> explore -> analyze -> modify -> validate -> document
```

## 관련 이슈

- Closes #21

## 변경 유형

- [ ] 기능 추가
- [x] 버그 수정
- [x] 테스트
- [ ] 문서
- [ ] 리팩터링

## 변경 사항

- `src/core/task-graph/TaskCandidateExtractor.ts`
  - `the problem is caused by ..., so fix that bug` 형태를 `fix the bug caused by ...`로 정규화합니다.
  - `because ..., so fix that defect` 형태를 `fix the defect because ...`로 정규화합니다.
  - `organize it in order when you have time` 같은 전체 진행 메타 문장을 task candidate에서 제외합니다.

- `src/core/task-graph/TaskGraphProcessor.ts`
  - `trace and explain ... order/passes through` 형태를 `analyze`로 우선 분류합니다.
  - `organize ... changes/results/commands ... work note` 형태를 `document`로 우선 분류합니다.

- `tests/ts/unit/core/task-graph/TaskCandidateExtractor.test.ts`
  - 실제 llama 번역 결과 기반 cause context 보존 테스트를 추가했습니다.
  - 결제/캐시/작업 노트 도메인의 대체 복합 프롬프트가 5개 실행 태스크로 추출되는지 검증합니다.

- `tests/ts/unit/core/task-graph/TaskGraphProcessor.test.ts`
  - trace+explain 흐름 분석 문장이 `analyze`로 분류되는지 검증합니다.
  - work note 정리 문장이 `document`로 분류되는지 검증합니다.

## 수정 전

실제 llama 번역 결과에서 다음 문제가 발생할 수 있었습니다.

```text
organize it in order when you have time
```

위 문장이 별도 `plan` 태스크로 들어가면서 5개 작업이 6개로 늘어났습니다.

```text
fix that defect
```

원인 정보인 cache expiration mismatch와 stale amount 맥락이 빠질 수 있었습니다.

```text
trace and explain the order in which data passes through ...
```

흐름 분석 문장이 `explore`로 분류될 수 있었습니다.

```text
organize the changes made and the results ... in the work note
```

문서화 작업이 `plan`으로 분류될 수 있었습니다.

## 수정 후

실제 llama 번역 결과 기준으로 다음 5개 후보가 유지됩니다.

```text
1. find where the module related to payment processing is scattered in the project.
2. trace and explain the order in which data passes through the router, handler, domain service, and data layer from the shopping cart to payment approval.
3. fix the defect because the cache expiration conditions do not match, the amount seems to be left with old values.
4. run smoke tests and related regression tests to verify that the same symptoms do not occur again.
5. organize the changes made and the results of the commands checked in the work note.
```

분류 결과:

```text
explore -> analyze -> modify -> validate -> document
```

dependency 결과:

```text
t1 -> t2 -> t3 -> t4 -> t5
```

## 검증

- [x] `npm run build`
- [x] `npm test -- tests/ts/unit/core/task-graph/TaskCandidateExtractor.test.ts tests/ts/unit/core/task-graph/TaskGraphProcessor.test.ts`
- [x] `npm test -- task-graph`
- [x] `npm run typecheck`
- [x] WSL Ubuntu 실제 llama + Kompress 실행

테스트 결과:

```text
Test Files  2 passed (2)
Tests       71 passed (71)
```

```text
Test Files  7 passed (7)
Tests       874 passed (874)
```

실제 llama 실행 결과:

```text
language: ko
inferenceTimeSec: 21.423
compressionRatio: 0.928
role2UsesNormalizedBeforeCompression: true
candidateSentenceCountIsFive: true
typeFlowMatchesExpected: true
dependencyFlowMatchesExpected: true
```

결과 파일:

```text
local_config/generated/role2-korean-hybrid-live-result.json
local_config/generated/role2-korean-hybrid-alt-live-result.json
```

## 리스크 / 참고 사항

- 이번 변경은 실제 LLM 출력에서 관찰된 표현을 deterministic rule로 보강합니다.
- `organize`는 plan/document 양쪽 의미가 있으므로, `work note`, `changes`, `results`, `commands`가 함께 있는 경우에만 document로 우선 분류합니다.
- `trace`는 단순 위치 추적일 때 explore로 남고, `trace and explain ... order/passes through`처럼 흐름 해석을 요구하는 경우에만 analyze로 우선 분류합니다.
- WSL 실행 중 `uv` launcher 경고가 출력되지만, `KOMPRESS_PYTHON_BIN` wrapper를 통해 Kompress worker가 fallback 실행되어 전체 경로는 성공했습니다.

## 변경 파일

```text
src/core/task-graph/TaskCandidateExtractor.ts
src/core/task-graph/TaskGraphProcessor.ts
tests/ts/unit/core/task-graph/TaskCandidateExtractor.test.ts
tests/ts/unit/core/task-graph/TaskGraphProcessor.test.ts
```

## 커밋

```text
cccecc6 fix: preserve role2 cause context
7f02b53 fix: harden alternate role2 task extraction
```
