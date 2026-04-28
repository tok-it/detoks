# Issue: Role 2.1 태스크 후보 추출기 구현

## 요약

Role 2.1의 문장 분해와 task graph 생성이 압축/번역 이후 남는 담화 표현, 공손 표현, 메타 지시문에 영향을 받습니다.

예를 들어 다음과 같은 한국어 요청은 실행해야 할 태스크가 5개입니다.

```text
음, 지금 바로 급한 건 아니지만 그래도 가능하면 차근차근 처리해줘.
혹시 괜찮다면 먼저 인증 관련 코드가 어디 있는지 찾아보고,
그 다음에는 로그인 요청이 컨트롤러에서 서비스와 저장소까지 어떻게 흘러가는지 자세히 분석해줘.
그리고 아마 중복 검증 로직 때문에 문제가 생기는 것 같으니까 그 버그를 수정해줘.
수정이 끝나면 꼭 회귀 테스트랑 관련 단위 테스트를 실행해서 제대로 고쳐졌는지 확인해줘.
마지막으로 같은 내용을 두 번 말하는 것 같긴 한데, 변경한 이유와 확인한 테스트 결과를 README나 작업 노트에 문서화해줘.
불필요한 말은 줄여도 되고, 중요한 작업 순서만 유지해줘.
```

하지만 단순 sentence splitter만으로는 `급하지 않지만`, `혹시 괜찮다면`, `같은 내용을 두 번 말하는 것 같긴 한데`, `불필요한 말은 줄여도 되고` 같은 표현을 실행 가능한 작업과 안정적으로 분리하기 어렵습니다.

## 재현 방법

Role 2.1 입력에 담화 표현과 메타 지시문이 섞인 5개 작업 프롬프트를 전달합니다.

```text
Well, it's not urgent right now, but please handle it step-by-step if possible.
If it's okay, first find where the authentication-related code is,
and then analyze in detail how the login request flows from the controller to the service and repository.
And since there seems to be a problem due to duplicate validation logic, please fix that bug.
After the fix, be sure to run regression tests and related unit tests to confirm that it has been fixed correctly.
Finally, although it seems like you are saying the same thing twice, document the reason for the change and the test results you confirmed in README or the work notes.
You can reduce unnecessary words, but please maintain only the important sequence of tasks.
```

기대 결과는 다음 5개 task입니다.

```text
find -> analyze -> fix -> run tests -> document
```

## 원인

`TaskSentenceSplitter`는 문장/절 경계를 나누는 저수준 컴포넌트입니다. 여기에 담화 표현 제거, 공손 표현 제거, 실행 가능한 작업 후보 판정까지 넣으면 splitter가 의미 해석을 과도하게 담당하게 됩니다.

그 결과 다음 문제가 생깁니다.

- 번역/압축 결과 표현이 조금만 달라져도 splitter 예외 규칙이 계속 늘어납니다.
- 문장 경계 분리와 task 후보 판정 책임이 섞입니다.
- Role 2.1의 `TaskGraphProcessor`가 실행 가능한 task sentence가 아닌 메타 문장을 입력으로 받을 수 있습니다.

## 기대 동작

- `TaskSentenceSplitter`는 저수준 문장/절 분해와 명백한 list preamble 제거만 담당합니다.
- `TaskCandidateExtractor`가 splitter 결과를 받아 실행 가능한 작업 후보만 정규화합니다.
- Orchestrator의 TaskGraphBuilder는 Role 2.1 graph 생성 전에 task candidate extraction을 수행합니다.
- 담화 표현이 포함된 5개 작업 요청은 `explore -> analyze -> modify -> validate -> document` 흐름으로 분류됩니다.

## 수정 방향

1. `TaskSentenceSplitter`를 저수준 범위에서 보강합니다.
   - numbered task list 앞의 directive lead-in 제거
   - `After the fix, run tests...` 같은 전제절이 action clause와 분리되지 않도록 처리
2. `TaskCandidateExtractor`를 추가합니다.
   - polite/modal prefix 제거
   - discourse connector 제거
   - 메타 지시문 필터링
   - 실행 가능한 action starter로 시작하는 문장만 후보로 반환
3. `orchestrator.ts`에서 `TaskGraphProcessor.process()` 전에 `TaskCandidateExtractor.extractSentences()`를 사용합니다.
4. 담화 표현이 많은 5개 작업 프롬프트가 5개 task graph로 생성되는 테스트를 추가합니다.

## 완료 조건

- [ ] 5개 작업이 포함된 담화형 Role 2.1 입력이 5개 task sentence로 정규화된다.
- [ ] graph task type이 `explore`, `analyze`, `modify`, `validate`, `document` 순서로 분류된다.
- [ ] task dependency가 `t1 -> t2 -> t3 -> t4 -> t5` 순서로 생성된다.
- [ ] splitter 보강은 저수준 문장 분해 책임 안에 머문다.
- [ ] 관련 task graph 및 orchestrator 테스트가 통과한다.
- [ ] 타입체크가 통과한다.

## 관련 파일

- `src/core/task-graph/TaskSentenceSplitter.ts`
- `src/core/task-graph/TaskCandidateExtractor.ts`
- `src/core/pipeline/orchestrator.ts`
- `tests/ts/unit/core/task-graph/TaskSentenceSplitter.test.ts`
- `tests/ts/unit/core/task-graph/TaskCandidateExtractor.test.ts`
- `tests/ts/unit/core/pipeline/orchestrator.test.ts`
