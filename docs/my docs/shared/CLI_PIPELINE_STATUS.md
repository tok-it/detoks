# detoks CLI Pipeline Status

## 기준
- 브랜치: `cli-runtime-ux-from-dev-20260425`
- 작성 기준일: 2026-04-27
- 용도: 현재 detoks CLI 개발이 전체 파이프라인 기준으로 어디까지 완료됐는지 빠르게 확인하기 위한 로컬 상태 문서

---

## 전체 파이프라인 개요

```text
CLI Input
→ Command Parsing
→ Help / Usage Routing
→ Session / Mode Resolution
→ Prompt / Sentence Split
→ Task Graph Build
→ DAG Validation / Dependency Resolution
→ Context Build / Compression
→ Adapter Execution Boundary
→ Subprocess Boundary
→ Output Formatting
→ Session State Save
→ CLI Output / REPL Loop
```

---

## 단계별 현재 상태

### 1. CLI Input / Entry
상태: 완료

- `detoks "<prompt>"`
- `detoks repl`
- CLI 엔트리포인트 동작

관련 파일:
- `src/cli/index.ts`

---

### 2. Command Parsing
상태: 완료

- `--adapter`
- `--execution-mode`
- `--verbose`
- `--help`
- `repl --help`
- 에러 메시지 / usage 안내

관련 파일:
- `src/cli/parse.ts`
- `tests/ts/unit/cli/parse.test.ts`

---

### 3. Help / Usage UX
상태: 대부분 완료

- main help / repl help 분리
- `stub` / `real` 설명 보강
- `verbose` 의미를 출력 계약 기준으로 정리
- help와 실제 출력 계약이 현재 기준으로 일치함
- main help / repl help 예시 문구 보강 완료

관련 파일:
- `src/cli/parse.ts`
- `tests/ts/unit/cli/parse.test.ts`

---

### 4. REPL UX
상태: 완료

- REPL 시작/종료
- `exit`, `quit`, `.exit`
- `/help` REPL builtin help 라우팅
- `/login` REPL arrow-key adapter chooser + login flow 진입 라우팅
- `/exit`, `/quit` slash exit 라우팅
- `/session` 현재 REPL session/runtime 상태 조회 라우팅
- `/adapter` REPL arrow-key adapter chooser 라우팅
- `/adapter codex|gemini` REPL adapter 전환 라우팅
- `/model <name>` REPL adapter model 전환 라우팅
- `/verbose` REPL arrow-key verbose chooser 라우팅
- `/verbose on|off` REPL output verbosity 전환 라우팅
- 시작 안내에 adapter / executionMode / verbose 표시
- REPL prompt에 현재 source 압축 표시 (`detoks[codex:gpt-5]>`)
- REPL prompt / chooser / 상태 메시지에 TTY 전용 ANSI 색상(theme: cyan focus, green success, yellow warning, red error, dim hint) 적용
- REPL 실행 결과 앞에 adapter/model/executionMode source badge를 첫 응답과 source 변경 시점에만 표시 (`◆ CODEX[gpt-5] · real` 등)
- CLI/REPL help/usage 텍스트에 TTY 전용 제목/섹션/옵션 강조 스타일 적용
- trace 보조 텍스트(`Trace saved`, trace markdown heading)에 TTY 전용 muted/bold 스타일 적용
- core logger / 실시간 `DETOKS_TRACE=1` stderr 라인에 ANSI label 스타일 적용
- trace markdown 본문 라벨(`Session ID`, `Total Duration`, `Type` 등)에 TTY 전용 bold 강조 적용
- REPL 시작/종료 smoke test 추가 완료

관련 파일:
- `src/cli/commands/repl.ts`
- `tests/ts/integration/cli-smoke.test.ts`

---

### 5. Prompt / Sentence Split
상태: 대부분 완료

- `TaskSentenceSplitter` 사용 중
- 현재 raw input을 sentence 단위로 나누는 흐름 있음
- Role 1 prompt compile / translate 결과가 orchestrator에 연결됨
- Korean/mixed 입력은 translation runtime 경계를 거쳐 compiled prompt로 handoff 가능

한계:
- 외부 live runtime smoke는 기본 자동화가 아니라 opt-in으로만 유지

관련 파일:
- `src/core/task-graph/TaskSentenceSplitter.ts`
- `src/core/pipeline/orchestrator.ts`

---

### 6. Task Graph Build
상태: 중상

- TaskGraphProcessor
- DAGValidator
- DependencyResolver
- ParallelClassifier

현재 가능:
- sentence 기반 task graph 생성
- 의존 관계 판정
- 병렬/순차 stage 분류

관련 파일:
- `src/core/task-graph/*`

---

### 7. Context Build / Compression
상태: 중상

- ContextCompressor 존재
- ContextBuilder 존재
- `depends_on` 기반 직접 의존성 결과만 선택하도록 정리됨

현재 특징:
- 이전에는 최근 task가 섞일 수 있었으나 현재는 직접 의존성 중심으로 정리됨

관련 파일:
- `src/core/context/ContextBuilder.ts`
- `src/core/context/ContextCompressor.ts`
- `tests/ts/unit/state-context.test.ts`

---

### 8. Adapter Execution Boundary
상태: 중상

- codex / gemini adapter boundary 존재
- `executionMode=stub|real` 분기 존재
- smoke에서 codex/gemini real 경로의 `rawOutput` 계약을 fake binary로 고정함
- adapter별 real request / subprocess boundary 단위 테스트가 존재함

현재 특징:
- adapter 구조는 있음
- `real` 경로는 subprocess boundary를 타도록 설계됨
- executor가 `executionMode=real`일 때 실제 subprocess runner를 선택하도록 연결됨
- adapter별 model pass-through 추가:
<<<<<<< codex-parallel-20260428-2a60d3c
  - codex: `codex exec --model <name> --ephemeral - ...`
=======
  - codex: `codex exec --model <name> - ...`
>>>>>>> dev
  - gemini: `gemini --model <name>`

관련 파일:
- `src/integrations/adapters/*`
- `src/core/executor/execute.ts`

---

### 9. Subprocess Boundary
상태: 부분 완료

- stub subprocess runner 존재
- real subprocess runner 존재
- CLI smoke에서 codex/gemini real 실행 시 stdout/rawOutput 일치 계약을 검증함
<<<<<<< codex-parallel-20260428-2a60d3c
- opt-in installed real smoke가 adapter별 prompt override/default 정책(`DETOKS_REAL_BINARY_SMOKE_CODEX_PROMPT`, `DETOKS_REAL_BINARY_SMOKE_GEMINI_PROMPT`)을 지원함
=======
>>>>>>> dev
- real smoke/batch smoke temp dir cleanup까지 반영됨

한계:
- real runner는 존재하지만, 실제 CLI binary 유무에 따라 runtime 결과가 달라질 수 있음
- executor는 execution mode에 따라 stub / real runner를 선택함

관련 파일:
- `src/integrations/subprocess/*`
- `src/core/executor/execute.ts`

---

### 10. Output Formatting
상태: 완료

- 기본 출력: concise JSON
- `--verbose`: full success JSON + error stack
- smoke / unit test로 고정됨
- one-shot `ok: false` 결과는 stdout 성공 포맷이 아니라 stderr 에러 포맷과 exit code 1로 처리됨

관련 파일:
- `src/cli/format.ts`
- `tests/ts/unit/cli/format.test.ts`
- `tests/ts/integration/cli-smoke.test.ts`

---

### 11. Session State Save
상태: 완료

- `.state/sessions/*.json` 저장
- session save / load / checkpoint manager 구조 존재
- session/checkpoint CLI UX까지 현재 브랜치 범위에서 연결됨

관련 파일:
- `src/core/state/SessionStateManager.ts`

---

### 12. CLI Output / REPL Loop
상태: 완료

- one-shot 결과 출력
- REPL 입력 루프
- error / success formatting 반영
- one-shot `ok: false` 결과는 stderr 에러 포맷 + exit code 1로 surface됨

관련 파일:
- `src/cli/index.ts`
- `src/cli/commands/repl.ts`
- `src/cli/format.ts`

---

## 아직 미완성인 큰 축

### A. Prompt / Translate / Guardrails / LLM Client 실제 연결
상태: 부분 완료

대상 디렉터리:
- `src/core/prompt/`
- `src/core/translate/`
- `src/core/guardrails/`
- `src/core/llm-client/`

현재:
- Prompt compiler / compression과 llama-server runtime 구조는 들어와 있음
- 다만 Translate / Guardrails / LLM client 전체가 CLI 흐름에 완전히 정착된 상태는 아님
- 번역용 runtime 설정 명칭을 `LOCAL_LLM_*` 기준으로 정리함
  - primary: `LOCAL_LLM_API_BASE` / `LOCAL_LLM_API_KEY` / `LOCAL_LLM_MODEL_NAME`
  - legacy alias: `OPENAI_API_BASE` / `OPENAI_API_KEY` / `MODEL_NAME`
  - legacy alias: `LM_STUDIO_URL` / `LM_STUDIO_API_KEY`
- 현재 cwd 기준 `.env` / `.env.local`에서 local LLM 설정을 자동 로드함
- `.env.example` 기준값 추가 완료
- Korean/mixed 입력에서 translation/LLM runtime 설정 누락 시 prompt compilation failure를 구조화된 pipeline 실패 결과로 surface하도록 연결됨
- 성공 경로 메타데이터 surface 반영 완료:
  - `promptLanguage`
  - `promptInferenceTimeSec`
  - `promptValidationErrors`
  - `promptRepairActions`
  - verbose CLI / concise one-shot CLI / session continue 경로에서 확인 가능
- orchestrator가 Role 1 runtime override(`env`, `fetchImplementation`)를 compile 단계까지 전달하도록 연결됨
- 이를 통해 local LLM request contract를 external network 없이 orchestrator 경계에서 검증 가능
  - `LOCAL_LLM_API_BASE` / `LOCAL_LLM_API_KEY` / `LOCAL_LLM_MODEL_NAME`
  - legacy alias: `OPENAI_API_BASE` / `OPENAI_API_KEY` / `MODEL_NAME`
  - legacy alias: `LM_STUDIO_URL` / `LM_STUDIO_API_KEY`
  - `/chat/completions` URL 조합
  - auth header / model payload
  - Korean input → translated compiled prompt → downstream execution handoff

남은 것:
- 실제 외부 llama/openai-compatible 서버 live 환경 smoke는 기본 자동화 범위에 넣지 않고 opt-in만 유지
- session/checkpoint read-only 경로에는 prompt 메타데이터를 확장하지 않음
  - 이유: live prompt compile 결과가 아니라 persisted session/checkpoint 조회 결과라 의미가 섞임
  - read-only 계약은 상태 조회 전용 필드만 유지

완료 (2026-04-28 `feat/guardrails-translate-pipeline-integration`):
- `--model <name>` CLI 플래그 추가 → parse.ts / CliArgs / PipelineExecutionRequest / adapter pass-through
- codex/gemini adapter model pass-through 완료 (`--model` flag)
- REPL `[translated] <compiledPrompt>` 힌트 concise 모드에서 inline 표시 완료
- REPL source badge (`◆ CODEX · stub`) 첫 응답/source 변경 시점에만 표시 완료
- adapter output guardrails 실전화:
  - `validate_adapter_output()` 추가 (`src/core/guardrails/validator.ts`)
  - orchestrator 성공 경로에서 각 task rawOutput에 대해 guardrails 호출 (warn 로깅)
  - `PipelineExecutionResult.outputWarnings?: string[]` 추가 → 경고 발생 시 surface
- taskType pass-through: RequestCategory를 orchestrator → executor → adapter까지 전달
- ExecutionResultNormalizer에 `checkStructuralCompleteness()` 추가 (task type 기반 출력 구조 검증)
- opt-in smoke 확장 여부: 현재 범위(opt-in) 유지 결정 (기본 자동화로 충분)

---

### B. Real Execution Path 실전화
상태: 거의 완료

현재:
- real/stub 개념 있음
- real subprocess path 있음
- executor가 `executionMode=real`일 때 real subprocess runner를 선택함
- codex/gemini real rawOutput 계약을 smoke/unit으로 고정함
- one-shot real non-zero 결과는 stderr + exit code 1로 고정함
- real execution 실패 시 stderr/rawOutput surface 계약이 명확히 고정됨 (non-verbose/verbose)
- 실제 설치된 binary 환경 opt-in smoke가 concise/verbose stdout 계약까지 검증함
- 실제 설치된 binary opt-in smoke 범위 제어 추가:
  - `DETOKS_REAL_BINARY_SMOKE_ADAPTER=codex|gemini`
  - `DETOKS_REAL_BINARY_SMOKE_ALL=1`
  - `DETOKS_REAL_BINARY_SMOKE_PROMPT`
  - `DETOKS_REAL_BINARY_SMOKE_TIMEOUT_MS`
- 실제 외부 local LLM prompt runtime smoke도 opt-in으로만 유지:
  - `DETOKS_LIVE_LOCAL_LLM_SMOKE=1`
  - `DETOKS_LIVE_LOCAL_LLM_API_BASE`
  - `DETOKS_LIVE_LOCAL_LLM_API_KEY`
  - `DETOKS_LIVE_LOCAL_LLM_MODEL_NAME`
  - `DETOKS_LIVE_LOCAL_LLM_SMOKE_PROMPT`
  - `DETOKS_LIVE_LOCAL_LLM_TIMEOUT_MS`

남은 것:
- 실제 설치된 binary 환경 / 외부 prompt runtime opt-in smoke를 더 늘릴지 여부 판단

---

### C. Session / Checkpoint UX
상태: 대부분 완료

현재:
- 세션 저장은 됨
- `checkpoint list <session-id>` read-only 진입점 추가 완료
- `checkpoint show <checkpoint-id>` read-only 진입점 추가 완료
- `checkpoint list`의 빈 세션 / populated 세션 출력 계약 고정 완료
- `session continue <session-id>` resume 진입점 추가 완료: stored raw_input 재사용, completed task skip, pending/failed task 재실행 계약 고정
- `session fork <source-session-id> <new-session-id>` mutation 진입점 추가 완료: source 존재 확인, target 중복 방지, session state 복제 계약 고정
- `session reset <session-id>` mutation 진입점 추가 완료: saved session 삭제 계약과 not-found 계약 고정
- `checkpoint restore <checkpoint-id>` mutation 진입점 추가 완료: checkpoint 기준 session history truncate 계약 고정
- session/checkpoint mutation 실패 UX 정리 완료: no-op/invalid mutation은 `ok=false`, `mutatesState=false`, exit code 1로 고정
- help/stdout 계약 정리 완료: `session continue/reset/fork`, `checkpoint list/show/restore`, `session list`의 사용자-facing 설명과 smoke/unit 검증 반영
- stdout 상위 필드 일관성 정리 완료: read-only 계열은 `mutatesState=false`, mutation/resume 계열은 `message`/`mutatesState` 기준을 공유
- read-only `session list` / `checkpoint list` / `checkpoint show`는 prompt 메타데이터를 의도적으로 surface하지 않도록 테스트로 고정
- ProjectDetector 추가: run/REPL 경로에서 project_id / project_name / project_path 감지 가능
- orchestrator session save 경로에 projectInfo 전달 연결 완료
- REPL registry가 프로젝트별 마지막 session을 저장하고 다음 REPL 시작 시 재사용 가능
- TTY 기반 REPL 시작 시 기존 session 발견 시 arrow-key chooser로 continue/new 선택하는 복원 UX 추가 (기본값: 새 session)

남은 것:
- session/checkpoint UX는 현재 브랜치 범위에서 대부분 정리 완료

---

## 실제 CLI 환경 테스트 가능 범위

현재 실제 CLI 환경 테스트는 아래 범위까지 가능:

- 기본 CLI smoke
  - one-shot / REPL / batch / session / checkpoint
  - `tests/ts/integration/cli-smoke.test.ts`
- 실제 설치된 adapter binary 기준 real smoke
  - opt-in
  - `DETOKS_REAL_BINARY_SMOKE=1`
  - `DETOKS_REAL_BINARY_SMOKE_ADAPTER=codex|gemini`
- 실제 외부 local LLM prompt runtime 기준 live smoke
  - opt-in
  - `DETOKS_LIVE_LOCAL_LLM_SMOKE=1`
  - `DETOKS_LIVE_LOCAL_LLM_API_BASE`
  - `DETOKS_LIVE_LOCAL_LLM_MODEL_NAME`

판단:
- 기본 자동화만으로도 현재 CLI 엔트리/출력 계약 검증은 가능
- 실제 설치 binary / 외부 runtime까지도 검증 가능하지만 기본 CI 범위에는 넣지 않고 opt-in으로 유지

---

## 현재까지 완료된 CLI UX 작업

- `execution-mode` help 보강
- `verbose` 출력 정책 정리
- one-shot smoke test 추가
- REPL 시작/종료 smoke test 추가
- help와 실제 출력 계약 점검 완료
- main help / repl help 예시 문구 보강
- CLI smoke JSON parse를 깨는 info 로그 문제 해결
- one-shot real non-zero 실행 결과를 stderr 에러 포맷 + exit code 1 smoke로 고정
- batch / real smoke temp dir cleanup 반영
- codex/gemini real rawOutput smoke coverage 대칭화
- real execution 실패 시 stderr/rawOutput surface 기준 명확화 (verbose/non-verbose 차이 고정)
- 실제 설치된 binary 환경 opt-in smoke (`DETOKS_REAL_BINARY_SMOKE=1`) 추가
- 실제 설치된 binary 환경 opt-in smoke를 concise/verbose stdout 계약까지 확장
- 실제 설치된 binary opt-in smoke의 adapter/prompt/timeout 범위 제어 추가
- 실제 외부 local LLM prompt runtime smoke를 기본 제외 + opt-in 계약으로 추가
- 번역용 runtime 설정 명칭을 `LOCAL_LLM_*` 기준으로 변경하고 legacy alias 호환 유지
- prompt compilation failure(translation/LLM 설정 누락)를 구조화된 stderr/pipeline 실패 계약으로 연결
- prompt/translate 성공 경로 메타데이터(`promptLanguage`, `promptInferenceTimeSec`, `promptValidationErrors`, `promptRepairActions`)를 verbose 결과로 surface
- local LLM request contract를 orchestrator 경계까지 연결: runtime override 전달 + Korean 입력 handoff 검증
- 실제 CLI가 cwd `.env`를 읽어 local LLM 연결 설정을 반영하는 smoke 추가
- prompt/translate 성공 경로 메타데이터를 concise one-shot 성공 출력까지 surface
- read-only `session/checkpoint` 조회 경로는 prompt 메타데이터 비노출 계약으로 고정
- `checkpoint list <session-id>` 진입점 및 출력 계약 고정
- `checkpoint show <checkpoint-id>` read-only 진입점 추가
- `session continue <session-id>` actual resume 계약 추가: stored raw_input replay + completed task skip + failed task retry
- `session fork <source-session-id> <new-session-id>` 최소 mutation 계약 추가: source 존재 확인, target 중복 방지, session state 복제
- `session reset <session-id>` 삭제 계약 추가
- `checkpoint restore <checkpoint-id>` restore/truncate 계약 추가
- session/checkpoint mutation failure UX 정리: no-op/invalid mutation은 `ok=false`, `mutatesState=false`, exit code 1로 고정
- session/checkpoint help 문구와 mutation exit-code 기준 정리
- session/checkpoint stdout 상위 필드(`message`, `mutatesState`) 일관성 정리
- 빈 `detoks` 진입 시 missing prompt 에러 대신 메인 CLI 가이드/help 출력 계약 추가
- REPL 내부 `/help` builtin help 라우팅 추가
- REPL 내부 `/login` arrow-key adapter chooser/login flow 라우팅 추가
- REPL 내부 `/exit` / `/quit` slash exit 라우팅 추가
- REPL 내부 `/session` builtin 라우팅 추가
- REPL 내부 `/adapter` arrow-key chooser + direct set builtin 라우팅 추가
- REPL 내부 `/verbose` arrow-key chooser + direct set builtin 라우팅 추가
- CLI `--model <name>` pass-through 및 REPL `/model <name>` builtin 추가

---

## 지금 기준 다음 우선순위 추천

### 1순위
실제 설치된 binary 환경 / 외부 prompt runtime opt-in smoke 추가 확장 필요 여부 판단

### 2순위
session/checkpoint UX 후속 확장 필요 여부 재판단

### 4순위
Prompt / Translate / Guardrails / LLM client 추가 실전화 범위 재판단

---

## 현재 판단 요약

현재 detoks CLI 개발은:

> CLI 런타임 UX + 파이프라인 오케스트레이션 골격 + 상태 저장 + smoke/unit test 안정화 + real execution 경계 smoke 고정 + session/checkpoint UX + prompt metadata surface + 실제 CLI opt-in smoke 경계 정리

까지는 꽤 진행되었고,

아직 남은 핵심은:

> opt-in smoke 확장 여부 판단 + session/checkpoint 후속 확장 여부 판단 + Prompt/Translate/Guardrails/LLM client 추가 실전화 범위 결정

이다.

---

## 다음 세션에서 이 파일을 보는 목적

다음에 자동화 작업을 재개할 때:

1. 현재 CLI 작업이 어디까지 끝났는지 확인
2. 이미 완료된 UX 작업을 중복하지 않기
3. 다음 work unit이 real execution 계약 보강인지, session UX인지, pipeline 연결인지 구분
4. 현재 브랜치 `cli-runtime-ux-from-dev-20260425`의 범위를 벗어나지 않게 하기
