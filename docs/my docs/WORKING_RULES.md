# Working Rules

## 세션 시작 시 먼저 읽을 파일
- `AGENTS.md`
- `docs/my docs/WORKING_RULES.md`
- `.prompts/common-agent-rules.md`
- `.prompts/cli-task-context.md`
- `docs/my docs/TMUX_WORKFLOW.md`
- `docs/my docs/CLI_PIPELINE_STATUS.md`

## 기본 진행 순서
1. 하네스 엔지니어링 프롬프트 생성
2. 우측 pane에서 즉시 실행
3. 완료 여부를 아래 3가지로 확인
   - 관련 파일 diff
   - 관련 테스트 결과
   - 우측 pane 출력
4. 작업이 실제 완료된 경우에만
   - 커밋/푸시
   - 새 브랜치 필요 여부 판단
   - Git Kanban In Progress 생성
   - 다음 하네스 프롬프트 생성

## tmux 소켓 권한 규칙
- Codex 환경에서 기존 tmux 서버를 제어할 때 `/private/tmp/tmux-501/default` 소켓 접근이 막힐 수 있다.
- 이 경우 tmux 관련 명령(`split-window`, `capture-pane`, `select-pane`, `display-message`, `ls`)은 권한 상승 경로로 다시 실행한다.
- tmux 소켓 권한 문제는 코드 작업 실패가 아니라 실행 환경 경계 문제로 본다.
- 필요하면 launcher를 tmux pane 안에서 직접 실행한다.

## PR 관련 규칙
- PR 내용은 기본 순서에서 자동 생성하지 않는다.
- 사용자가 실제로 PR 생성이 필요하다고 할 때만 해당 시점의 최신 커밋/푸시 기준으로 생성한다.

## .gitignore 규칙
- `.gitignore`에 **추가**는 바로 진행한다.
- `.gitignore`의 **수정/삭제**는 반드시 먼저 사용자에게 확인한다.

## CLI 파이프라인 상태 문서 갱신 규칙
- detoks CLI 작업을 진행할 때마다 `docs/my docs/CLI_PIPELINE_STATUS.md`를 참고한다.
- 다음 항목에 변화가 생기면 작업 후 반드시 갱신한다.
  - 단계별 현재 상태
  - 완료된 것 / 진행 중인 것 / 다음 우선순위
  - 현재까지 완료된 CLI UX 작업
  - 현재 판단 요약

## 작업 단위 원칙
- 작은 work unit으로 유지한다.
- unrelated local changes는 건드리지 않는다.
- 오류/예외 상황이 아니면 하네스 프롬프트 생성과 우측 pane 실행을 같이 시작한다.
