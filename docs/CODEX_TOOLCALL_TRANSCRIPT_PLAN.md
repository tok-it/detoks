# Codex transcript를 tool call / file edit / final answer 중심으로 바꾸는 계획

## 배경
현재 Codex real transcript는 lifecycle 상태와 일부 content만 보여주고 있습니다.
그 결과 사용자 입장에서는 아래 두 가지 문제가 남습니다.

1. 실제로 어떤 작업을 했는지 흐름이 잘 안 보인다.
2. tool call / file edit / 최종 답변이 분리되어 보이지 않는다.

이번 작업의 목표는 transcript를 다음 3개의 축으로 재구성하는 것입니다.

- **tool call**: 무엇을 읽고, 무엇을 실행했는지
- **file edit**: 어떤 파일이 어떻게 바뀌었는지
- **final answer**: 작업이 끝난 뒤 모델이 사용자에게 준 최종 요약

## 목표
- lifecycle noise보다 실제 작업 단위를 우선 보여준다.
- tool call과 file edit을 분리해 보여준다.
- 최종 응답은 transcript의 마지막에 명확히 남긴다.
- raw JSON event는 내부 파싱용으로만 쓰고, 화면에는 사람이 읽는 구조만 남긴다.

## 핵심 원칙
1. **tool call 우선**
   - `read`, `search`, `exec`, `run`, `fetch` 계열은 먼저 보이게 한다.
2. **file edit 명시**
   - 수정된 파일 경로와 변경 요약을 transcript에 넣는다.
3. **final answer 분리**
   - 작업 중 로그와 최종 답변을 섞지 않는다.
4. **기계용 이벤트 숨김**
   - `thread.started`, `turn.started`, `item.completed` 같은 lifecycle 이벤트는 기본적으로 접거나 요약한다.

## 세부 계획

### 1단계: 이벤트 모델 분리
**목표**
- Codex JSON 이벤트를 tool call, file edit, final answer 중심으로 다시 분류한다.

**세부 작업**
- 현재 들어오는 JSON event type 목록을 정리한다.
- 다음 분류를 정의한다.
  - lifecycle
  - tool_call
  - tool_result
  - file_edit
  - final_answer
  - diagnostic
  - unknown
- 지금 transcript panel에서 어떤 이벤트가 어디로 가는지 매핑표를 만든다.

**완료 기준**
- 어떤 JSON 이벤트가 어떤 화면 요소가 되는지 명확하다.
- lifecycle 중심 로직과 작업 중심 로직이 분리된다.

### 2단계: tool call 표시 형식 설계
**목표**
- 사용자가 “무슨 도구가 왜 호출됐는지” 이해할 수 있게 한다.

**세부 작업**
- tool call 이름을 짧게 표시한다.
  - 예: `tool: read_file`
  - 예: `tool: exec npm test`
- 입력 인자가 길면 요약만 남긴다.
- tool result는 성공/실패와 짧은 결과만 보여준다.
- 중복되는 lifecycle 상태 문구는 tool call과 충돌하지 않게 숨긴다.

**완료 기준**
- transcript에서 tool call 하나가 독립된 블록으로 읽힌다.
- 실행 명령과 결과가 구분된다.

### 3단계: file edit 요약 설계
**목표**
- 실제 코드 변경이 transcript에서 보이도록 한다.

**세부 작업**
- workspace diff 또는 git diff 기반으로 변경 파일 목록을 수집한다.
- 다음처럼 표시한다.
  - `file: src/cli/tui/panels/transcript.ts`
  - `file: tests/ts/unit/cli/tui/panels/transcript.test.ts`
- 가능하면 변경 유형도 요약한다.
  - added / updated / deleted
- 긴 diff 내용은 transcript에 전부 넣지 말고, file summary + 필요 시 별도 확장으로 둔다.

**완료 기준**
- 작업 결과가 “무슨 파일이 바뀌었는지” 기준으로 보인다.
- file edit이 final answer와 분리된다.

### 4단계: final answer 정리
**목표**
- 모델의 최종 답변을 transcript 마지막에 명확히 남긴다.

**세부 작업**
- `--output-last-message` 결과를 최종 답변으로 사용한다.
- final answer는 다른 작업 로그와 구분된 섹션으로 표시한다.
- 요약이 비어 있으면 tool/file edit 요약을 바탕으로 간단한 fallback을 만든다.

**완료 기준**
- transcript 끝에 최종 요약이 명확히 보인다.
- 작업 중 로그와 최종 응답이 섞이지 않는다.

### 5단계: transcript 렌더링 규칙 정리
**목표**
- tool call / file edit / final answer가 시각적으로 구분되게 한다.

**세부 작업**
- 각 블록에 접두어를 붙인다.
  - `[tool]`
  - `[edit]`
  - `[final]`
- 필요하면 색상 또는 강조를 다르게 준다.
- 너무 긴 블록은 줄바꿈/ellipsis 규칙을 통일한다.

**완료 기준**
- transcript를 스캔했을 때 작업 흐름이 한눈에 보인다.
- 상태 이벤트는 화면 우선순위에서 밀린다.

### 6단계: 테스트와 검증
**목표**
- 사람용 transcript 규칙이 회귀 없이 유지되도록 한다.

**세부 작업**
- transcript panel 단위 테스트를 추가한다.
- tool call / file edit / final answer 샘플 이벤트 테스트를 추가한다.
- real path에서 Codex JSON stream과 last-message fallback이 함께 동작하는지 확인한다.
- 실제 `detoks repl --execution-mode real` 수동 점검을 한다.

**완료 기준**
- raw lifecycle 이벤트가 화면에 직접 나오지 않는다.
- tool/file/final 블록이 실제로 보인다.
- 최종 답변이 누락되지 않는다.

## 구현 우선순위
1. 이벤트 모델 분리
2. tool call 표시 형식
3. file edit 요약
4. final answer 정리
5. 렌더링 규칙
6. 테스트

## 범위 밖
- Codex CLI의 내부 UI를 그대로 복제하는 일
- 실제 모델의 hidden reasoning을 노출하는 일
- 다른 adapter의 UI를 동일 방식으로 강제하는 일

## 기대 결과
- transcript가 “상태 로그”가 아니라 “작업 기록”처럼 보인다.
- 사용자는 코드 작업이 진행되는 흐름을 이해할 수 있다.
- 최종 결과와 변경 파일이 분리되어 보여서 디버깅이 쉬워진다.
