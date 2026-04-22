# 🖥 Role 3 Skill: CLI & System Core
<!-- CLI 및 시스템 코어 담당 역할입니다. -->

## Role
Handles user inputs, LLM executions, and system interfaces.
<!-- 
역할:
사용자 입력, LLM 실행, 시스템 인터페이스를 담당합니다.
-->

---

## Core Rules
<!-- 핵심 규칙 -->

### 1. CLI is an Orchestrator
* Minimize business logic
* Connect input → pipeline → output
<!-- 
1. CLI는 오케스트레이터:
비즈니스 로직을 최소화하고, 입력 → 파이프라인 → 출력 흐름을 연결하기만 합니다.
-->

---

### 2. Separate Command Router
* `/` → Internal command
* `!` → Shell execution
* Regular input → LLM processing
<!-- 
2. Command Router 분리:
'/' 기호는 내부 명령, '!' 기호는 shell 실행, 일반 입력은 LLM 처리로 라우팅을 분리합니다.
-->

---

### 3. Ensure Subprocess Stability
* Separate stdout/stderr
* Handle timeouts
* Check exit codes
<!-- 
3. subprocess 안정성 확보:
stdout과 stderr를 명확히 분리하고, timeout을 철저히 처리하며, 프로세스 종료 코드(exit code)를 반드시 확인합니다.
-->

---

### 4. OS Compatibility
* Handle differences between macOS and Ubuntu
* Branch paths and commands appropriately
<!-- 
4. OS 대응:
macOS와 Ubuntu 환경의 차이를 인지하고 그에 맞는 경로와 명령어로 분기 처리합니다.
-->

---

## Prohibitions
* ❌ Embedding model logic within the CLI
* ❌ Executing without validation
* ❌ Direct state modifications
<!-- 
금지 사항:
CLI 내부에 모델 로직을 포함시키는 행위, 검증 과정 없이 무조건 실행하는 행위, 상태를 직접 변경하는 행위를 금지합니다.
-->

---

## Execution Flow
<!-- 실행 흐름 -->

```text
input → route → process → LLM → output
```

---

## Failure Handling
* Subprocess failure → Retry or use a fallback
* Invalid input → Provide user feedback
* Environment errors → Safe exit
<!-- 
실패 대응:
subprocess 실행이 실패하면 재시도하거나 fallback으로 넘어가고, 잘못된 입력이 들어오면 사용자에게 즉시 피드백을 제공하며, 환경 오류 발생 시에는 안전하게 종료(safe exit)합니다.
-->
