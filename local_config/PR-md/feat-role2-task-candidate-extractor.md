# PR: Role 2.1 태스크 후보 추출기 구현

## 요약

이 PR은 Role 2.1 task graph 생성 전에 실행 가능한 task sentence만 추출하는 hybrid 전처리 단계를 추가합니다.

기존 구조에서는 `TaskSentenceSplitter`가 문장/절 분해를 수행한 뒤 바로 `TaskGraphProcessor`가 타입과 의존성을 분류했습니다. 하지만 실제 한국어 프롬프트를 번역/정규화/압축한 결과에는 다음과 같은 표현이 남을 수 있습니다.

- `not urgent right now`
- `if it's okay`
- `although it seems like you are saying the same thing twice`
- `reduce unnecessary words`
- `maintain only the important sequence`

이런 표현은 문장 경계 문제가 아니라 실행 가능한 task 후보 판정 문제이므로, `TaskSentenceSplitter`는 저수준 분해에 머물게 하고 새 `TaskCandidateExtractor`가 후보 정규화와 메타 문장 제거를 담당하도록 분리했습니다.

```text
Role 2.1 normalized input
-> TaskSentenceSplitter
-> TaskCandidateExtractor
-> TaskGraphProcessor
-> TaskGraph
```

## 관련 이슈

- Closes #20

## 변경 유형

- [x] 기능 추가
- [x] 버그 수정
- [x] 테스트
- [ ] 문서
- [ ] 리팩터링

## 변경 사항

- `src/core/task-graph/TaskSentenceSplitter.ts`
  - numbered task list 앞의 directive lead-in을 제거합니다.
  - `After the fix, run tests...`처럼 전제절로 시작하는 comma clause가 action clause와 잘못 분리되지 않도록 보강했습니다.

- `src/core/task-graph/TaskCandidateExtractor.ts`
  - Role 2.1 입력에서 실행 가능한 task candidate만 추출하는 새 컴포넌트를 추가했습니다.
  - polite/modal prefix를 제거합니다.
  - discourse connector와 순서 표현을 제거합니다.
  - `not urgent`, `reduce unnecessary words`, `same thing twice` 같은 메타 표현을 task 후보에서 제외합니다.
  - 실행 가능한 action starter로 시작하는 문장만 task candidate로 반환합니다.

- `src/core/pipeline/orchestrator.ts`
  - TaskGraphBuilder 단계에서 `TaskSentenceSplitter.split()`을 직접 호출하지 않고 `TaskCandidateExtractor.extractSentences()`를 사용하도록 변경했습니다.
  - Role 2.1 graph 생성 전에 담화/메타 표현을 제거한 task sentence가 `TaskGraphProcessor`로 전달됩니다.

- `tests/ts/unit/core/task-graph/TaskSentenceSplitter.test.ts`
  - directive lead-in이 포함된 numbered list가 5개 작업 문장으로 분리되는지 검증합니다.

- `tests/ts/unit/core/task-graph/TaskCandidateExtractor.test.ts`
  - 담화 표현이 많은 5개 작업 입력에서 실행 가능한 5개 task sentence만 추출되는지 검증합니다.
  - 추출된 task가 `explore -> analyze -> modify -> validate -> document`로 분류되고 순차 dependency를 갖는지 검증합니다.

## 수정 전

Role 2.1 graph 생성 흐름이 splitter 결과를 바로 task graph processor에 넘겼습니다.

```text
normalized input
-> TaskSentenceSplitter
-> TaskGraphProcessor
```

이 경우 담화 표현과 메타 지시문이 task sentence에 섞이면 task 분리, 타입 분류, dependency 생성이 흔들릴 수 있습니다.

## 수정 후

Role 2.1 graph 생성 전에 task candidate extraction 단계를 둡니다.

```text
normalized input
-> TaskSentenceSplitter
-> TaskCandidateExtractor
-> TaskGraphProcessor
```

예상 task 흐름:

```text
find auth code
-> analyze login flow
-> fix duplicate validation bug
-> run regression/unit tests
-> document change reason and test results
```

## 검증

- [x] `npm run typecheck`
- [x] `npm test -- tests/ts/unit/core/task-graph/TaskCandidateExtractor.test.ts tests/ts/unit/core/task-graph/TaskSentenceSplitter.test.ts tests/ts/unit/core/pipeline/orchestrator.test.ts`
- [x] `npm test -- task-graph`

테스트 결과:

```text
Test Files  3 passed (3)
Tests       49 passed (49)
```

```text
Test Files  7 passed (7)
Tests       870 passed (870)
```

## 리스크 / 참고 사항

- `TaskSentenceSplitter`에는 의미 해석을 많이 넣지 않고, list preamble 제거와 comma split 안정화처럼 저수준 분해 책임에 가까운 보강만 넣었습니다.
- `TaskCandidateExtractor`는 현재 action starter 기반의 결정적 규칙으로 동작합니다. 번역/압축 결과 표현이 늘어나면 extractor의 discourse/meta 규칙과 action starter 사전을 확장할 수 있습니다.
- extractor가 후보를 하나도 찾지 못하면 기존 `TaskSentenceSplitter.split()` 결과로 fallback하여 기존 동작과의 호환성을 유지합니다.

## 변경 파일

```text
src/core/pipeline/orchestrator.ts
src/core/task-graph/TaskCandidateExtractor.ts
src/core/task-graph/TaskSentenceSplitter.ts
tests/ts/unit/core/task-graph/TaskCandidateExtractor.test.ts
tests/ts/unit/core/task-graph/TaskSentenceSplitter.test.ts
```

## 커밋

```text
ea09534 fix: harden task sentence splitting
9adcd7a feat: extract role2 task candidates
```
