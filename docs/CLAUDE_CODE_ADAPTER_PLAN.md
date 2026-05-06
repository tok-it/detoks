# Claude Code Adapter 추가 계획

기준:
- 작업 시작 브랜치: `dev`에서 분기한 새 작업 브랜치
- 목표: detoks CLI에 `claude`를 새 adapter로 추가
- 원칙: 최소 변경, 관련 테스트 우선, dev 반영 후 main은 별도 릴리스 흐름

---

## 1) 계약/타입 확장

### 목표
`claude`를 detoks 내부 타입과 CLI 옵션에서 1급 adapter로 인식하게 만든다.

### 범위
- `src/core/pipeline/types.ts`
  - `AdapterValues`에 `claude` 추가
- `src/core/executor/types.ts`
  - adapter 흐름에 새 값이 깨지지 않는지 확인
- `src/cli/parse.ts`
  - `--adapter claude` 허용
- `src/cli/terminal-style.ts`
  - adapter badge / 색상 / 출력 문자열이 있으면 반영
- 관련 unit test
  - parse, terminal style, adapter 타입 관련 테스트 추가/수정

### 완료 기준
- CLI help/parse에서 `claude`가 허용된다.
- 타입체크가 통과한다.
- 기존 `codex`, `gemini` 경로가 깨지지 않는다.

### 주의사항
- 아직 실제 Claude Code CLI 명령은 고정하지 않는다.
- 먼저 타입과 사용자-facing 옵션부터 열어 둔다.

---

## 2) adapter 구현 및 executor 연결

### 목표
`claude`를 실제 실행 가능한 adapter로 등록한다.

### 범위
- 새 adapter 파일 추가
  - 예: `src/integrations/adapters/claude/adapter.ts`
- `src/core/executor/execute.ts`
  - adapter registry에 `claude` 등록
- `src/integrations/adapters/interface.ts`
  - 공용 계약이 필요한지 확인
- `src/integrations/subprocess/*`
  - real/stub subprocess 경로와의 연결 점검

### 구현 메모
- 실제 CLI 바이너리 이름은 먼저 확인한다.
  - 예: `claude`, `claude` 등
- `buildSubprocessRequest()`에서 다음을 정한다.
  - command 이름
  - model 옵션 지원 여부
  - stdin prompt 전달 방식
  - cwd 전달 방식
- `execute()`는 기존 adapter 패턴을 따른다.
  - `stub`이면 stub rawOutput
  - `real`이면 subprocess 실행

### 완료 기준
- `executeWithAdapter({ adapter: "claude" })`가 동작한다.
- stub / real 경로가 분리된다.
- adapter-specific subprocess request 테스트가 통과한다.

### 주의사항
- Claude Code가 codex/gemini와 같은 모델 선택 UX를 제공하지 않으면 억지로 맞추지 않는다.
- CLI 계약이 확인되기 전에는 최소한의 subprocess 구조만 고정한다.

---

## 3) CLI UX / 설정 / 테스트 / 문서 연결

### 목표
유저가 REPL과 one-shot에서 `claude`를 실제로 선택하고 사용할 수 있게 만든다.

### 범위
- `src/cli/repl-commands/index.ts`
  - `/adapter` 선택 목록에 `claude` 추가
  - 필요한 경우 login/status 안내 추가
- `src/cli/commands/repl.ts`
  - 시작/전환 메시지에 새 adapter 표기 반영
- `src/cli/adapter-info/*`
  - Claude Code용 login/status 함수가 필요하면 추가
- `src/cli/config/*`
  - adapter 저장 정책이 필요하면 반영
- `tests/ts/integration/cli-smoke.test.ts`
  - `--adapter claude` 스모크 추가
- `tests/ts/unit/*`
  - parse / repl / executor / adapter path 관련 테스트 보강
- README / help / docs
  - 사용 가능한 adapter 목록 업데이트

### 완료 기준
- REPL에서 `claude`를 선택할 수 있다.
- CLI help와 실제 동작이 일치한다.
- smoke / unit test가 새 adapter를 포함한다.

### 주의사항
- 설정 저장이 필요한지 먼저 결정한다.
  - adapter 선택만 저장할지
  - 모델/로그인 상태까지 저장할지
- 사용자 문구는 기존 `codex`, `gemini` 톤과 맞춘다.

---

## 권장 진행 순서

1. 계약/타입 확장
2. adapter 구현 및 executor 연결
3. CLI UX / 테스트 / 문서 연결

---

## 성공 조건 요약

- `claude`가 `--adapter` 옵션과 REPL에서 보인다.
- 실제 subprocess 실행 경로가 존재한다.
- smoke / unit / typecheck / build가 통과한다.
- dev 브랜치에 반영 가능한 수준으로 정리된다.
