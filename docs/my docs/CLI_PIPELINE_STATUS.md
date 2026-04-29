# detoks CLI Pipeline Status

## 기준
- 브랜치: `cli-runtime-ux-from-dev-20260425`
- 작성 기준일: 2026-04-29
- 최근 반영 커밋: `6be410f docs(cli): update pipeline status`
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

- `detoks` → REPL
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
- `detoks` no-arg REPL 진입 안내 추가
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
- 시작 안내에 adapter / executionMode / verbose 표시
- REPL 시작/종료 smoke test 추가 완료
- Slash commands: `/help`, `/clear`, `/model`, `/adapter`, `/mode`, `/verbose`, `/exit`
- REPL main prompt에서 `/` 단일 입력 시 builtin command menu를 inline으로 표시
- `/` 입력은 command menu 라우팅으로 처리되고, 방향키 선택 UI와 함께 동작함
- Adapter info queries: `/llm-model` (인증상태), `/llm-models` (사용 가능 모델)
- Arrow-key selection menu는 alternate screen / hide cursor / clear redraw를 사용해 프레임 누적을 줄임
- 긴 옵션 목록은 터미널 높이에 맞춰 windowed scrolling으로 표시됨
- wide text / emoji 라벨은 width-aware truncation으로 처리됨
- TTY가 아니면 첫 옵션을 자동 선택함
- ESC는 현재 메뉴만 취소하고, Ctrl-C는 REPL 종료로 처리됨
- 메뉴 open/close 훅으로 readline pause/resume를 정리함

관련 파일:
- `src/cli/commands/repl.ts`
- `src/cli/repl-commands/index.ts`
- `src/cli/adapter-info/codex.ts` (codex 쿼리)
- `src/cli/adapter-info/gemini.ts` (gemini 설정 읽기)
- `src/cli/interactive/select-with-arrows.ts`
- `tests/ts/unit/cli/select-with-arrows.test.ts`
- `tests/ts/integration/cli-smoke.test.ts`

---

### 5. Prompt / Sentence Split
상태: 부분 완료

- `TaskSentenceSplitter` 사용 중
- 현재 raw input을 sentence 단위로 나누는 흐름 있음

한계:
- Role 1의 실제 Prompt Compiler / Translate 결과를 받아 연결하는 단계는 아직 미완성

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

현재 특징:
- adapter 구조는 있음
- `real` 경로는 subprocess boundary를 타도록 설계됨
- executor가 `executionMode=real`일 때 실제 subprocess runner를 선택하도록 연결됨

관련 파일:
- `src/integrations/adapters/*`
- `src/core/executor/execute.ts`

---

### 9. Subprocess Boundary
상태: 부분 완료

- stub subprocess runner 존재
- real subprocess runner 존재
- CLI smoke에서 codex/gemini real 실행 시 stdout/rawOutput 일치 계약을 검증함

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
- token reduction metrics(`tokenMetrics`)가 있을 때 concise 출력에도 포함
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

한계:
- checkpoint UX는 CLI 관점에서 아직 본격 노출되지 않음

관련 파일:
- `src/core/state/SessionStateManager.ts`

---

### 12. CLI Output / REPL Loop
상태: 완료

- one-shot 결과 출력
- REPL 입력 루프
- error / success formatting 반영

관련 파일:
- `src/cli/index.ts`
- `src/cli/commands/repl.ts`
- `src/cli/format.ts`

---

## 아직 미완성인 큰 축

### A. Prompt / Translate / Guardrails / LLM Client 실제 연결
상태: 미완성

대상 디렉터리:
- `src/core/prompt/`
- `src/core/translate/`
- `src/core/guardrails/`
- `src/core/llm-client/`

현재는 문서/구조는 보이나 CLI 파이프라인의 실질 동작에 완전히 연결된 상태는 아님.

---

### B. Real Execution Path 실전화
상태: 진행 중

현재:
- real/stub 개념 있음
- real subprocess path 있음
- executor가 `executionMode=real`일 때 real subprocess runner를 선택함

남은 것:
- adapter별 실제 command execution 검증

---

### C. Session / Checkpoint UX
상태: 대부분 완료

현재:
- 세션 저장은 됨
- `detoks session list --human`으로 세션 목록을 사람용 출력으로 확인 가능
- `detoks session show --human`으로 저장된 세션 상세, 작업별 요약, 작업 출력 미리보기를 확인 가능
- 세션별 마지막 작업 요약(last work summary) 표시 가능
- 세션별 입력/출력 토큰 절감 요약(tokenMetrics) 표시 가능
- `detoks session continue`에서 재진입 대상 세션의 resumeOverview를 stderr/JSON로 자동 출력 가능
- `detoks session reset`, `detoks session fork`, `detoks checkpoint list/show/restore`가 CLI에 연결됨

남은 것:
- continue / reset / fork / checkpoint restore의 인간 친화 출력 문구 정리
- session / checkpoint smoke coverage 보강
- REPL과 one-shot에서 session inspection UX를 더 일관되게 묶기

---

## 현재까지 완료된 CLI UX 작업

- `detoks` no-arg REPL 진입 추가
- `detoks session list --human` 추가 및 last work summary / token reduction 표시
- `detoks session show --human` 추가 및 저장된 작업 결과 / raw_output 미리보기 조회
- `detoks session continue`에 재진입 세션 요약 출력 추가
- REPL main prompt의 `/` 입력을 builtin command menu inline 라우팅으로 연결
- arrow-key selection menu UX 개선(ESC 취소, windowed scrolling, width-aware truncation, non-TTY fallback)
- `execution-mode` help 보강
- `verbose` 출력 정책 정리
- one-shot smoke test 추가
- REPL 시작/종료 smoke test 추가
- help와 실제 출력 계약 점검 완료
- main help / repl help 예시 문구 보강
- CLI smoke JSON parse를 깨는 info 로그 문제 해결
- one-shot real non-zero 실행 결과를 stderr 에러 포맷 + exit code 1 smoke로 고정
- REPL slash command system 구현 (`/help`, `/clear`, `/model`, `/adapter`, `/mode`, `/verbose`, `/exit`)
- 번역 모델 선택/다운로드 UI 구현 (로컬 LLM 모델 설정)
- Adapter 인증 상태 및 모델 발견 명령 추가 (`/llm-model`, `/llm-models`)
- Codex CLI 쿼리 함수 구현 (`codex login status`, `codex debug models`)
- Gemini 설정 파일 읽기 함수 구현 (`~/.gemini/settings.json`)

---

## 지금 기준 다음 우선순위 추천

### 1순위
adapter별 실제 command execution 검증 및 real execution path end-to-end 보강

### 2순위
Prompt / Translate / Guardrails / LLM client 연결

### 3순위
session / checkpoint CLI UX 문구 및 smoke coverage 마무리

### 4순위
남은 작은 CLI UX polishing

---

## 현재 판단 요약

현재 detoks CLI 개발은:

> CLI 런타임 UX + REPL 기본 진입 + selection menu UX 개선 + session inspection + 파이프라인 오케스트레이션 골격 + 상태 저장 + smoke/unit test 안정화

까지는 꽤 진행되었고,

아직 남은 핵심은:

> Role 1 실제 처리 연결 + real execution path 실전화 + session UX 고도화

이다.

---

## 다음 세션에서 이 파일을 보는 목적

다음에 자동화 작업을 재개할 때:

1. 현재 CLI 작업이 어디까지 끝났는지 확인
2. 이미 완료된 UX 작업을 중복하지 않기
3. 다음 work unit이 session/checkpoint 마감인지, real pipeline 연결인지 구분
4. 브랜치 `cli-runtime-ux`의 범위를 벗어나지 않게 하기
