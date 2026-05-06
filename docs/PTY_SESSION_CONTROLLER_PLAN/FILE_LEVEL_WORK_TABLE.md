# PTY / Session Controller + TUI 기본 모드 파일 단위 작업표

목표:
- `codex`와 `claude` 실행 경로를 PTY/session controller 기반으로 전환한다.
- `detoks repl`은 interactive TTY에서 full-screen TUI를 기본 모드로 연다.
- `--tui`는 explicit force/compatibility flag로 유지하고, `--no-tui`는 legacy text REPL fallback으로 둔다.
- detoks의 내부 진행 상태와 모델의 중간/최종 출력을 한 번의 최종 결과에 함께 포함한다.
- detoks 사용으로 절감된 토큰 정보(tokenMetrics / token reduction)도 최종 산출물에 함께 포함한다.
- 현재의 `gemini` 경로는 우선 기존 subprocess/pipeline 흐름을 유지하는 것을 기본 전제로 둔다.

범위 기준:
- 최소 변경 우선
- real execution 경로 우선
- stub 경로는 기존 계약을 최대한 유지
- interactive REPL은 TUI 우선, one-shot은 기존 텍스트 출력 유지
- 최종 산출물은 `detoks progress + adapter transcript + token reduction + final summary` 구조

기본 모드 결정:
- interactive TTY에서 `detoks repl` → full-screen TUI
- `detoks repl --tui` → TUI를 명시적으로 강제
- `detoks repl --no-tui` → legacy text REPL
- non-TTY / CI → TUI를 강제하지 않고 fallback 경로 사용

프롬프트 입력 시 UI 상태:
- 이 항목은 최종 산출물이 아니라, 사용자가 프롬프트를 입력한 뒤 실행 중/실행 직후 REPL UI에 표시되는 파이프라인 상태 패널이다.
- 현재 detoks CLI의 UI 포맷을 그대로 쓰되, 추가 메타정보는 표시하지 않는다.
- 표시 예시:

```text
파이프라인 상태
✗ Prompt Compiler (실패)
✗ Task Graph Builder (실패)
✗ Context Optimizer (실패)
· Executor (준비)
✗ State Manager (실패)
```

- 즉, detoks는 최종 응답 외에 **실행 진행 상태 요약 패널**도 보여줘야 한다.

---

## 1) 파일 단위 작업표

| 우선순위 | 파일 | 작업 내용 | 완료 기준 |
|---|---|---|---|
| P0 | `src/integrations/subprocess/types.ts` | PTY용 이벤트/트랜스크립트 계약 추가. 예: chunk, prompt, reply, exit, timeout 같은 이벤트를 표현할 수 있게 확장 | PTY 결과를 구조적으로 전달할 수 있다 |
| P0 | `src/integrations/subprocess/runner.ts` | `spawn(... pipe ...)` 중심 구현을 PTY/session controller 중심으로 분리. stdout/stderr chunk를 실시간으로 수집하고 stdin을 즉시 닫지 않는 경로 추가 | codex/claude 실행 중 출력이 실시간으로 관찰된다 |
| P0 | `src/integrations/adapters/codex/adapter.ts` | codex real path가 PTY runner를 사용할 수 있게 연결. 필요 시 command/args/request 구성을 session controller 친화적으로 조정 | codex가 PTY 경로로 실행된다 |
| P0 | `src/integrations/adapters/claude/adapter.ts` | claude real path가 PTY runner를 사용할 수 있게 연결. 확인 프롬프트 대응용 최소 인터페이스를 둔다 | claude가 PTY 경로로 실행된다 |
| P0 | `src/integrations/adapters/real.ts` | runner 결과를 단순 `stdout/stderr`가 아니라 transcript-aware 결과로 정규화 | 최종 출력에 실시간 transcript를 포함할 기반이 생긴다 |
| P0 | `src/core/executor/types.ts` | adapter 실행 결과에 `transcript`, `events`, `interactionTurns` 같은 부가 필드 추가 여부 결정 | executor가 PTY 메타데이터를 운반할 수 있다 |
| P0 | `src/core/executor/execute.ts` | executor가 새 runner/adapter 결과를 그대로 전달 | 상위 계층에서 transcript를 잃지 않는다 |
| P0 | `src/core/pipeline/types.ts` | `PipelineExecutionResult`에 detoks 진행 로그, adapter transcript, tokenMetrics를 함께 실을 수 있는 필드 추가 | 최종 CLI 결과 스키마가 합본 출력을 표현한다 |
| P0 | `src/core/pipeline/orchestrator.ts` | `PipelineProgressEvent`를 누적 기록하고, 모델 transcript와 tokenMetrics를 병합할 수 있게 저장 구조를 만든다 | detoks 내부 진행상태와 토큰 절감 정보가 최종 결과에 남는다 |
| P0 | `src/cli/tui/*` | full-screen TUI shell, layout, panels, keybindings, confirmation modal, scrollback, live transcript rendering | `detoks repl`가 interactive TTY에서 대시보드를 기본으로 연다 |
| P0 | `src/cli/index.ts` | `repl` 진입 시 interactive TTY에서는 TUI를 우선 띄우고, one-shot은 기존 텍스트 출력 규칙을 유지 | REPL 기본 모드가 TUI로 바뀐다 |
| P0 | `src/cli/commands/repl.ts` | REPL 부트스트랩과 모드 분기를 정리해 TUI / legacy text REPL / non-TTY fallback을 선택 | `--tui` / `--no-tui` / 자동 fallback이 동작한다 |
| P0 | `src/cli/parse.ts` | `--tui`, `--no-tui` 및 관련 fallback 정책을 파싱 계약에 반영 | 사용자가 TUI 기본 모드를 명확히 제어할 수 있다 |
| P1 | `src/cli/format.ts` | TUI 종료 요약 및 legacy text REPL 출력에서 `detoks progress`, `adapter transcript`, `token reduction`, `final output` 섹션을 재사용 가능하게 정리 | 사람이 읽을 수 있는 요약 출력이 유지된다 |
| P1 | `src/integrations/adapters/interface.ts` | adapter execution contract 변경이 필요하면 최소 범위로 반영 | 새 실행 계약이 adapter 레벨에서 통일된다 |
| P1 | `src/cli/terminal-spinner.ts` | PTY 실시간 출력과 spinner 충돌이 없도록 출력 우선순위 조정 | spinner가 transcript를 가리지 않는다 |
| P1 | `src/cli/runtime-notice.ts` | TUI 기본 모드 및 fallback 경고/안내 문구가 필요하면 보강 | 사용자에게 실행 모드가 명확하다 |
| P2 | `package.json` / `package-lock.json` | PTY 라이브러리(`node-pty` 등)를 쓸 경우 의존성 추가 | native PTY 구현 경로가 잠긴다 |
| P2 | `README.md`, `README.ko.md`, `README.en.md`, `CLI_USAGE_GUIDE.md` | 새 상호작용 방식과 출력 계약 문서화 | 사용자 문서가 구현과 일치한다 |

---

## 2) 테스트 단위 작업표

| 우선순위 | 파일 | 작업 내용 | 완료 기준 |
|---|---|---|---|
| P0 | `tests/ts/unit/integrations/subprocess/runner.test.ts` | stdout/stderr 버퍼링 대신 실시간 chunk / PTY 동작 검증 추가 | runner 변경이 회귀 없이 보장된다 |
| P0 | `tests/ts/unit/integrations/adapters/real-path.test.ts` | codex/claude real path가 새 runner contract를 소비하는지 확인 | adapter별 request/result contract가 유지된다 |
| P0 | `tests/ts/unit/core/executor/execute.test.ts` | executor가 transcript-aware 결과를 손상 없이 전달하는지 확인 | executor layer가 새 필드를 보존한다 |
| P0 | `tests/ts/unit/core/pipeline/orchestrator.test.ts` | detoks progress + adapter transcript 병합/순서 검증 | 파이프라인 결과가 기대한 순서로 나온다 |
| P0 | `tests/ts/unit/cli/tui/*` | TUI 기본 모드, 패널 렌더링, keybinding, confirm modal, fallback 선택을 검증 | TUI가 기본 모드로 안정적으로 열린다 |
| P0 | `tests/ts/unit/cli/format.test.ts` | 최종 human/verbose 출력과 legacy text REPL 출력에 detoks transcript와 token reduction이 포함되는지 확인 | 출력 포맷이 새 계약과 맞는다 |
| P0 | `tests/ts/integration/cli-smoke.test.ts` | REPL/TUI/one-shot에서 실시간 출력과 최종 합본 출력이 모두 노출되는지 확인 | CLI 전체 흐름이 실제로 동작한다 |
| P1 | `tests/ts/unit/cli/repl.test.ts` | REPL builtin / 출력 연결이 새 transcript 계약과 TUI default routing을 깨지 않는지 확인 | REPL 명령 계약이 유지된다 |
| P1 | `tests/ts/unit/cli/session-show.test.ts` | 세션 재조회 시 저장된 transcript/summary 노출 여부 확인 | 저장된 출력 재사용이 가능하다 |

---

## 3) 구현 순서 제안

1. **transport 계약 확장**
   - `src/integrations/subprocess/types.ts`
   - `src/integrations/subprocess/runner.ts`

2. **adapter 연결**
   - `src/integrations/adapters/codex/adapter.ts`
   - `src/integrations/adapters/claude/adapter.ts`
   - `src/integrations/adapters/real.ts`

3. **상위 계약 확장**
   - `src/core/executor/types.ts`
   - `src/core/executor/execute.ts`
   - `src/core/pipeline/types.ts`
   - `src/core/pipeline/orchestrator.ts`

4. **출력 합치기**
   - `src/cli/format.ts`
   - `src/cli/commands/repl.ts`
   - 필요 시 `src/cli/index.ts`
   - 필요 시 `src/cli/tui/*`

5. **테스트 정리**
   - runner → adapter → executor → pipeline → CLI 순으로 갱신

6. **의존성/문서**
   - PTY 라이브러리 채택 여부 확정 후 `package.json` 갱신
   - README / usage guide 정리

---

## 4) 최소 구현 범위와 확장 범위

### 최소 구현 범위
- codex / claude real path를 PTY로 실행
- 실시간 stdout/stderr chunk를 수집
- interactive REPL은 full-screen TUI를 기본으로 연다
- 프롬프트 입력 후 실행 중 UI에 파이프라인 상태 패널을 보여줌
- detoks progress를 함께 보여줌
- 최종 결과에 transcript와 token reduction을 합쳐서 출력

### 확장 범위
- session controller가 `y/n`, `continue`, `apply` 같은 확인 질문을 감지해서 사용자 입력을 되돌려줌
- adapter별 질문 패턴을 규칙화
- 재시도/중단/세션 재개까지 포함한 대화형 제어

### 제외 범위
- one-shot 실행을 full-screen TUI로 강제 전환하는 것
- non-TTY/CI 환경에서 TUI를 강제하는 것
- 모든 CLI의 질문 패턴을 완전 일반화하는 범용 에이전트 컨트롤러

---

## 5) 예상 변경량 감각

| 범위 | 예상 파일 수 | 예상 규모 |
|---|---:|---:|
| PTY 실시간 출력만 | 6~8개 | 300~500 LOC |
| PTY + session controller + 합본 출력 | 10~15개 | 800~1,300 LOC |
| 여기에 의존성/문서/CI까지 포함 | 12~18개 | 900~1,500 LOC |

---

## 6) 완료 조건

- `codex`와 `claude` real execution이 PTY 기반으로 동작한다.
- `detoks repl`가 interactive TTY에서 기본적으로 TUI를 연다.
- 프롬프트 입력 후 실행 중 UI에 pipeline status panel이 보인다.
- detoks의 내부 진행 상태와 모델 출력이 최종 결과에 함께 들어간다.
- 최종 출력에 token reduction 정보가 포함된다.
- REPL과 one-shot의 출력 계약이 일관된다.
- 관련 unit / integration test가 새 contract를 검증한다.

---

## 7) TUI 기본 모드 구현 단계

### Phase 0: 모드 결정 로직

목표:
- `detoks repl`이 현재 터미널 환경에 따라 TUI 또는 text REPL을 선택한다.

작업:
- `src/cli/parse.ts`
  - `--tui` / `--no-tui` 파싱 추가
  - interactive TTY / non-TTY / CI 기준 정리
- `src/cli/commands/repl.ts`
  - TUI 우선 진입 여부를 결정하는 resolver 추가
  - fallback 정책 문구 정리
- `src/cli/index.ts`
  - REPL 진입 시 mode resolution을 호출하도록 연결

완료 기준:
- interactive TTY에서 `detoks repl`이 TUI를 연다.
- `--no-tui`는 legacy text REPL로 내려간다.
- non-TTY / CI에서는 TUI를 강제하지 않는다.

### Phase 1: TUI 셸 스캐폴드

목표:
- full-screen TUI의 최소 셸을 띄운다.

작업:
- `src/cli/tui/*`
  - screen manager
  - layout / panes
  - keybinding
  - cleanup / restore
- `src/cli/commands/repl.ts`
  - TUI 시작/종료 브리지

완료 기준:
- TUI가 화면 전체를 점유하고 정상 종료 시 터미널을 복원한다.

### Phase 2: 패널 렌더링

목표:
- detoks의 기존 정보를 패널로 재배치한다.

작업:
- 파이프라인 상태 패널
- live transcript 패널
- token reduction 패널
- session / checkpoint 패널

완료 기준:
- 현재 CLI가 출력하던 핵심 정보가 TUI의 고정 패널로 보인다.

### Phase 3: PTY / session controller 연결

목표:
- codex / claude의 실시간 출력과 확인 프롬프트를 TUI에 연결한다.

작업:
- PTY runner 연결
- interactive prompt bridge
- confirm / retry / stop 처리

완료 기준:
- 실행 중 모델 출력과 사용자 입력이 한 화면 안에서 주고받힌다.

### Phase 4: 검증 및 문서

목표:
- TUI 기본 모드가 회귀 없이 동작하는지 확인한다.

작업:
- TUI unit test
- REPL smoke test
- fallback test
- README / usage guide 업데이트

완료 기준:
- TUI default, text fallback, one-shot text output이 각각 기대대로 동작한다.

---

## 8) 첫 구현 작업 단위

권장 첫 작업:
1. `src/cli/parse.ts`
2. `src/cli/commands/repl.ts`
3. `src/cli/index.ts`
4. `src/cli/tui/` 스캐폴드
5. `tests/ts/unit/cli/repl.test.ts`
6. `tests/ts/integration/cli-smoke.test.ts`

이 순서로 가면:
- 모드 판정이 먼저 고정되고
- TUI 스캐폴드가 그 위에 얹히며
- 기존 텍스트 REPL과 one-shot 출력은 안전하게 유지된다.
