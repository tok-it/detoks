# Real Mode 전체 파이프라인 연결 계획

기준:
- 대상: `detoks repl --execution-mode real`
- 목적: TUI/REPL에서 프롬프트 입력부터 실행, transcript, 결과 요약, 상태 갱신까지 한 흐름으로 연결
- 원칙: `stub`은 테스트/CI용으로 유지하고, `real`은 사용자 실제 사용 경로로 정리
- 현재 상태: 파이프라인 단계와 최종 결과는 연결되어 있으나, PTY 기반 transcript와 런타임 시작 시점은 아직 정리 여지가 있음

---

## 1) 실행 계약부터 정리

### 목표
`real` 모드에서 무엇을 언제 전달할지 명확히 정의한다.

### 세부 작업
- `src/core/pipeline/types.ts`
  - `PipelineExecutionRequest`에 실시간 adapter 이벤트 전달용 필드 추가 여부 검토
  - 예: `onAdapterEvent` / `onPtyEvent`
- `src/core/executor/types.ts`
  - executor request/result에 transcript 관련 메타데이터를 넣을지 결정
- `src/integrations/adapters/interface.ts`
  - adapter 실행 컨텍스트에 PTY 이벤트 콜백을 넣을지 결정
  - `stub`/`real` 경로를 분리하는 정책을 문서화
- `src/core/executor/execute.ts`
  - `real` 모드의 기본 동작은 유지하되, transcript 이벤트를 받을 수 있는 계약만 열어 둔다

### 완료 기준
- 타입 수준에서 `real` 모드와 transcript 전달 경로가 표현된다.
- `stub` 모드 동작은 깨지지 않는다.
- 기존 unit test가 컴파일 단계에서 무너지지 않는다.

### 비고
- 이 단계에서는 UI를 바꾸지 않는다.
- “실시간으로 무엇을 전달할지”만 먼저 합의한다.

---

## 2) 실제 실행 경로를 PTY 중심으로 연결

### 목표
`real` 모드의 adapter 실행 결과를 transcript 이벤트까지 포함해 수집한다.

### 세부 작업
- `src/integrations/adapters/real.ts`
  - 일반 subprocess 실행과 PTY 실행의 역할을 분리
  - TUI 또는 transcript 필요 시 `executeAdapterViaPtySubprocess(...)` 사용
  - non-TUI / one-shot 경로는 기존 subprocess 유지 가능
- `src/integrations/subprocess/runner.ts`
  - `runWithTranscript()`이 만드는 이벤트 형태를 재사용
  - `stdout`, `stderr`, `prompt`, `exit`, `error` 이벤트가 안정적으로 쌓이도록 유지
- `src/core/executor/execute.ts`
  - adapter 실행 결과에 transcript가 있으면 상위로 그대로 전달
- `src/core/pipeline/orchestrator.ts`
  - `executeWithAdapter()` 결과를 pipeline result에 반영
  - transcript 이벤트가 있으면 TUI가 받을 수 있도록 result에 실어 둔다

### 완료 기준
- `real` 모드 실행 결과에서 `adapterTranscript`를 얻을 수 있다.
- adapter 실패 시에도 `stderr`와 exit code가 보존된다.
- `spawn()` 기반 실행과 PTY 기반 실행의 책임이 분명하다.

### 비고
- 사용자 화면에 자동으로 브라우저를 여는 동작은 넣지 않는다.
- 외부 CLI가 URL을 출력하는 경우는 detoks가 열지 말고 transcript로 보여 주는 쪽을 우선한다.

---

## 3) 런타임 시작 시점을 한 번으로 묶기

### 목표
로컬 LLM/translation runtime이 프롬프트마다 불필요하게 다시 시작되지 않게 한다.

### 세부 작업
- `src/core/llm-client/local-runtime.ts`
  - `ensureLocalLlmRuntime()`의 중복 시작 방지 동작을 유지
  - startup signature가 바뀌는 조건을 명확히 한다
- `src/core/translate/translate.ts`
  - translation 호출 전에 runtime을 준비하는 현재 흐름을 유지하되, 재진입 시 중복 비용이 없는지 확인
- `src/cli/commands/repl.ts`
  - REPL 시작 시점에 runtime 준비를 앞당길지 검토
  - `real` 모드에서 첫 입력 전에 준비할지, 첫 프롬프트 시점에 준비할지 결정
- `src/cli/tui/index.ts`
  - TUI 진입 직후 상태 배너에 runtime 준비 상태를 보여 줄지 검토

### 완료 기준
- 같은 세션에서 프롬프트를 여러 번 실행해도 runtime이 매번 새로 뜨지 않는다.
- 첫 실행/재실행 시 동작이 예측 가능하다.
- `localLlmAutoStart=false`는 명시적으로 유지된다.

### 비고
- 이 단계는 UX와 성능 모두에 영향을 준다.
- 현재 디폴트 설정값과 실제 사용자 환경을 함께 고려한다.

---

## 4) TUI에 전체 흐름을 반영

### 목표
빈 화면이 아니라 실행 상태가 계속 보이는 TUI를 만든다.

### 세부 작업
- `src/cli/tui/index.ts`
  - 첫 화면에서 banner / pipeline / transcript / result / input / footer 순서가 자연스럽게 보이게 유지
  - `executePrompt()`에서 pipeline progress와 adapter transcript를 동시에 반영
  - 실행 중에는 상태 패널이 갱신되고, 종료 후 result 패널이 채워지도록 유지
- `src/cli/tui/panels/pipeline-status.ts`
  - 진행 중인 stage 상태가 실제 execution 흐름과 맞는지 점검
- `src/cli/tui/panels/transcript.ts`
  - empty state와 real transcript 모두 읽기 쉬운지 확인
  - stdout / stderr / scroll 동작 유지
- `src/cli/tui/panels/result-summary.ts`
  - 성공/실패/다음 작업/토큰 절감 요약이 최종 결과와 맞는지 점검
- `src/cli/tui/renderer.ts`
  - 입력 구분선과 footer가 content 영역을 침범하지 않도록 유지
  - 좁은 화면에서도 최소 정보가 보이도록 유지

### 완료 기준
- TUI 진입 후 “거의 빈 화면”이 아닌 구조화된 화면이 보인다.
- 첫 프롬프트 실행 전에는 안내 상태가 보이고, 실행 후에는 transcript/result가 채워진다.
- 리사이즈 후에도 구분선/입력/푸터가 깨지지 않는다.

### 비고
- 이 단계는 시각적 안정성에 직접 영향이 있다.
- 기존 intro animation은 유지하고, 그 뒤 메인 화면만 풍부하게 만든다.

---

## 5) 실패, 종료, 예외 흐름 정리

### 목표
실제 실행 중 문제가 나도 사용자 경험이 깨지지 않게 한다.

### 세부 작업
- `src/core/pipeline/orchestrator.ts`
  - 실패 시 `nextAction`이 충분히 구체적인지 확인
  - adapter 실패 / prompt 실패 / runtime 실패를 구분
- `src/core/llm-client/local-runtime.ts`
  - 서버 시작 실패 시 기존 프로세스 정리
  - 동일 포트/동일 모델 충돌 메시지 정리
- `src/cli/tui/index.ts`
  - `Ctrl+C`, `q`, 창 닫기 등 종료 시 raw mode와 alt screen이 안전하게 복구되는지 확인
- `src/integrations/subprocess/runner.ts`
  - timeout / spawn error / non-zero exit의 메시지 누락이 없는지 확인

### 완료 기준
- 실패해도 transcript/result에 원인 파악 정보가 남는다.
- 종료 후 터미널이 raw mode에 남지 않는다.
- 재시도 시 이전 실패 상태가 다음 실행을 방해하지 않는다.

### 비고
- 실제 사용자 환경에서 가장 자주 겪는 문제를 우선 정리한다.
- URL 자동 오픈 같은 부작용은 여기서 억제한다.

---

## 6) 테스트와 검증 순서

### 목표
구현을 끝낸 뒤 실제 사용자 환경과 가장 비슷한 방식으로 검증한다.

### 세부 작업
- 단위 테스트
  - `src/core/executor/execute.ts` 경로
  - adapter real/stub 분기
  - transcript 이벤트 수집
  - TUI panel empty state
- 통합 테스트
  - `tests/ts/integration/cli-smoke.test.ts`
  - `tests/ts/integration/tui-korean-input.test.ts`
  - real 모드 one-shot smoke
- 빌드/타입체크
  - `npm run typecheck`
  - `npm run build`
- 수동 TTY 확인
  - `node dist/src/cli/index.js repl --tui --execution-mode real`
  - 임시 `HOME` / 임시 `cwd`로 첫 실행과 일반 실행을 각각 확인

### 완료 기준
- typecheck/build/test가 모두 통과한다.
- TTY에서 intro 이후 메인 화면이 비어 보이지 않는다.
- 첫 프롬프트 실행 후 transcript/result가 실제로 채워진다.

### 비고
- `stub`은 CI와 빠른 회귀 테스트에 남겨 둔다.
- `real`은 실제 사용자 플로우 검증에 사용한다.

---

## 권장 구현 순서

1. 실행 계약 정리
2. PTY 중심 실행 경로 연결
3. 런타임 시작 시점 한 번으로 묶기
4. TUI 패널과 상태 반영
5. 실패/종료/예외 정리
6. 테스트와 배포 전 검증

---

## 성공 조건 요약

- `real` 모드에서 프롬프트 실행 → 파이프라인 진행 → adapter 실행 → transcript/result 반영이 한 줄로 이어진다.
- `stub` 모드는 유지되며 테스트 목적으로 계속 쓸 수 있다.
- 사용자 입장에서 TUI가 빈 화면처럼 보이지 않는다.
- 배포 전 검증이 `dist` 기준으로도 재현된다.
