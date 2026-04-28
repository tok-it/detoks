# Issue: Role 2.1 실제 LLM 번역 표현 기반 태스크 후보 보강

## 요약

Role 2.1 태스크 후보 추출기는 담화 표현이 섞인 한국어 프롬프트를 실제 llama로 번역한 결과를 입력으로 받습니다. 기존 hybrid 구조는 5개 태스크 분리 자체는 가능했지만, 실제 LLM 번역 표현이 달라질 때 다음 문제가 확인되었습니다.

- `the problem is caused by ... so fix that bug` 형태에서 원인 맥락이 `fix that bug`로 축약될 수 있음
- `organize it in order when you have time` 같은 전체 진행 메타 문장이 별도 plan 태스크로 들어갈 수 있음
- `trace and explain ... passes through ...` 문장이 분석 작업이 아니라 탐색 작업으로 분류될 수 있음
- `organize the changes ... in the work note` 문장이 문서화 작업이 아니라 plan으로 분류될 수 있음

## 재현 방법

WSL Ubuntu에서 실제 llama + Kompress 경로로 다음과 같은 5개 작업 프롬프트를 실행합니다.

```text
지금 당장 처리해야 하는 일은 아니니까 여유 있을 때 순서대로 정돈해줘.
괜찮으면 먼저 결제 처리와 관련된 모듈이 프로젝트 어디에 흩어져 있는지 찾아줘,
이어서 장바구니에서 결제 승인까지 데이터가 라우터, 핸들러, 도메인 서비스, 데이터 계층을 어떤 순서로 지나가는지 추적해서 설명해줘.
그리고 아마 캐시 만료 조건이 서로 맞지 않아서 금액이 오래된 값으로 남는 것 같으니 그 결함을 고쳐줘.
고친 뒤에는 스모크 테스트와 관련 회귀 테스트를 돌려서 같은 증상이 다시 안 나는지 검증해줘.
끝으로 내가 장황하게 말한 부분은 빼고, 바꾼 내용과 확인한 명령 결과를 작업 노트에 정리해줘.
말투는 간단히 다듬어도 되지만 이 순서는 유지해줘.
```

기대 흐름:

```text
explore -> analyze -> modify -> validate -> document
```

## 원인

실제 llama 번역 결과는 정해진 테스트 문장과 다르게 표현될 수 있습니다.

예를 들어 원인-수정 문장이 다음처럼 번역됩니다.

```text
And probably because the cache expiration conditions do not match, the amount seems to be left with old values, so fix that defect.
```

이 표현은 `fix that defect`만 추출하면 원인 맥락을 잃습니다.

또한 문서화 요청이 다음처럼 번역될 수 있습니다.

```text
organize the changes made and the results of the commands checked in the work note.
```

`organize`만 보면 plan으로 분류되지만, `changes/results/work note`가 함께 있으면 문서화 태스크입니다.

## 기대 동작

- 전체 진행 메타 문장은 task candidate에서 제외합니다.
- 원인-수정 문장은 원인 맥락을 보존한 수정 태스크로 정규화합니다.
- `trace and explain ... passes through ...`는 분석 태스크로 분류합니다.
- `organize ... changes/results ... work note`는 문서화 태스크로 분류합니다.
- 실제 llama + Kompress 실행에서도 5개 태스크와 순차 dependency가 유지됩니다.

## 수정 방향

1. `TaskCandidateExtractor`에서 진행 메타 문장 필터를 보강합니다.
2. `TaskCandidateExtractor`에서 `because ..., so fix that defect` 형태의 원인 맥락을 보존합니다.
3. `TaskGraphProcessor`에서 trace+explain 흐름 분석 idiom을 analyze로 우선 분류합니다.
4. `TaskGraphProcessor`에서 work note 정리 표현을 document로 우선 분류합니다.
5. 실제 LLM 번역 표현을 단위 테스트에 추가합니다.

## 완료 조건

- [ ] 실제 llama 번역 결과에서 cause context가 보존된다.
- [ ] 대체 복합 프롬프트가 5개 task candidate로 정규화된다.
- [ ] task type이 `explore`, `analyze`, `modify`, `validate`, `document` 순서로 분류된다.
- [ ] task dependency가 `t1 -> t2 -> t3 -> t4 -> t5` 순서로 생성된다.
- [ ] task graph 테스트가 통과한다.
- [ ] 타입체크가 통과한다.

## 관련 파일

- `src/core/task-graph/TaskCandidateExtractor.ts`
- `src/core/task-graph/TaskGraphProcessor.ts`
- `tests/ts/unit/core/task-graph/TaskCandidateExtractor.test.ts`
- `tests/ts/unit/core/task-graph/TaskGraphProcessor.test.ts`
- `local_config/generated/role2-korean-hybrid-live-result.json`
- `local_config/generated/role2-korean-hybrid-alt-live-result.json`
