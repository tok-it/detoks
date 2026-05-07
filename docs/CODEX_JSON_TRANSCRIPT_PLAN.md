# Codex JSON 이벤트를 사람용 transcript로 정리하는 계획

## 배경
현재 `detoks repl --execution-mode real`의 Codex 경로는 `--json` 스트리밍을 받아 실시간으로 TUI에 보여줍니다.
다만 지금 화면에는 다음과 같은 기계용 이벤트명이 그대로 노출됩니다.

- `thread.started`
- `turn.started`
- `item.completed`
- `turn.completed`

이 작업의 목표는 **Codex CLI의 내부 이벤트를 사용자 친화적인 transcript로 변환**하는 것입니다.

## 목표
- 라이프사이클 이벤트는 숨기거나 요약한다.
- 실제 사용자에게 의미 있는 답변 텍스트만 우선 노출한다.
- 제어문자 / ANSI 잔여값이 transcript에 섞이지 않도록 정리한다.
- Codex CLI의 최종 응답은 `--output-last-message` 결과를 기준으로 유지한다.

## 세부 계획

### 1단계: 이벤트 분류 기준 정리
**목표**
- Codex JSON 이벤트를 아래 3종류로 나눈다.
  - lifecycle: `thread.started`, `turn.started`, `turn.completed`, `item.completed`
  - content: `message.delta`, `text`, 최종 답변 본문
  - diagnostic: `error`, `warning`, 내부 상태 로그

**세부 작업**
- 현재 transcript panel이 받아들이는 이벤트 예시를 정리한다.
- 어떤 이벤트를 숨길지, 어떤 이벤트를 묶어서 보여줄지 정한다.
- `thread/turn/item` 계열의 표시 정책을 명시한다.

**완료 기준**
- Codex JSON 이벤트가 어떤 역할인지 한눈에 구분된다.
- transcript에 노출할 이벤트 우선순위가 문서화된다.

### 2단계: transcript formatter 설계
**목표**
- raw JSONL 한 줄을 그대로 노출하지 않고, 사람이 읽는 문장으로 변환한다.

**세부 작업**
- `message.delta` 계열은 텍스트 조각으로 누적 표시한다.
- `turn.started`, `thread.started`는 기본적으로 숨기거나 접는다.
- `turn.completed`는 짧은 상태 요약만 남길 수 있게 한다.
- `error`는 `[ERR]` 접두어로 통일한다.

**완료 기준**
- formatter 입력/출력 예시가 정리된다.
- 유지할 이벤트와 버릴 이벤트가 명확하다.

### 3단계: 스트림 파서 정리
**목표**
- JSONL chunk를 안전하게 누적하고, 잘린 JSON 조각이나 제어문자가 섞여도 깨지지 않게 한다.

**세부 작업**
- 줄 단위 JSON 파싱 실패 시 raw text fallback 규칙을 둔다.
- ANSI / 제어문자 제거 규칙을 추가한다.
- 부분 chunk가 여러 번 들어와도 transcript가 흔들리지 않도록 버퍼 전략을 정리한다.

**완료 기준**
- 깨진 JSON / 제어문자 / 빈 줄 처리 규칙이 정의된다.
- partial chunk 입력에 대한 기대 동작이 명확하다.

### 4단계: TUI transcript 패널 반영
**목표**
- transcript panel이 lifecycle noise 대신 실제 진행 문맥만 보여주게 한다.

**세부 작업**
- 라이프사이클 이벤트는 접고, 필요하면 축약 라벨만 보이게 한다.
- 사용자 응답 본문은 누적해서 자연스럽게 보이게 한다.
- 최종 메시지는 raw output과 구분해서 표시한다.

**완료 기준**
- 화면에 보이는 메시지가 “진행 로그”가 아니라 “대화 transcript”처럼 보인다.

### 5단계: 예외 및 폴백 규칙 정리
**목표**
- Codex JSON schema가 바뀌거나 알 수 없는 이벤트가 와도 사용자 화면이 깨지지 않게 한다.

**세부 작업**
- unknown event type은 조용히 축약 표시하거나 무시한다.
- 파싱 실패 시 raw line fallback을 유지한다.
- `--json`이 실패하면 현재의 fallback 경로가 안전하게 동작하는지 확인한다.

**완료 기준**
- schema drift 상황에서도 TUI가 멈추지 않는다.
- 디버그용 정보와 사용자용 정보가 분리된다.

### 6단계: 테스트와 검증
**목표**
- transcript가 사람용 문장으로 보이는지 회귀 없이 검증한다.

**세부 작업**
- transcript panel 단위 테스트 추가
- Codex JSON stream runner 테스트 추가
- real-path adapter 테스트에서 `--json` / `--output-last-message` 유지 확인
- 실제 `detoks repl --execution-mode real` 수동 점검

**완료 기준**
- 핵심 테스트가 모두 통과한다.
- 실제 TUI에서 이벤트명이 아니라 사람이 읽는 문장이 보인다.

## 구현 우선순위
1. 이벤트 분류 기준 정리
2. formatter 설계
3. 스트림 파서 정리
4. TUI 반영
5. 예외 처리
6. 테스트

## 범위 밖
- Codex CLI 자체의 UI를 복제하는 일
- adapter CLI의 내부 이벤트 스키마를 변경하는 일
- 다른 adapter까지 동일 포맷으로 강제하는 일

## 기대 결과
- `detoks`의 Codex real transcript가 내부 이벤트 덤프처럼 보이지 않는다.
- 사용자는 “Codex CLI가 실제로 답변하는 화면”처럼 인식할 수 있다.
- 디버그 정보는 남기되 기본 화면은 더 읽기 쉬워진다.
