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

---

## Team Branch Strategy
<!-- 팀 공통 브랜치 전략입니다. -->

### Branch Roles
- Default integration branch: `dev`
- Stable release branch: `main`
- Short-lived working branches: `feature/*`, `fix/*`, `docs/*`, `chore/*`, `hotfix/*`
<!-- 한국어 설명: 기본 개발 통합 브랜치는 dev, 안정 배포 브랜치는 main으로 두고, 실제 작업은 목적별 단기 브랜치에서 진행합니다. -->

### Team Rules
- Do not push directly to `dev` or `main`.
- Open a pull request for every feature, fix, documentation update, or refactor.
- Keep each pull request focused on one task or one tightly related change set.
- Rebase or sync your branch with `dev` before requesting review.
<!-- 한국어 설명: 보호된 통합 브랜치에는 직접 푸시하지 않고, 모든 변경은 PR을 통해 올리며, PR 범위는 작고 명확하게 유지해야 합니다. -->

### Recommended Flow
1. Create a branch from `dev`.
2. Name the branch using a task-oriented prefix: `feature/`, `fix/`, `docs/`, `chore/`.
3. Commit small, reviewable changes.
4. Open a PR targeting `dev`.
5. Merge only after approval and CI success.
6. Promote `dev` → `main` only for stable milestones or release-ready states.
<!-- 한국어 설명: 일반 작업은 dev에서 분기한 브랜치에서 진행하고, 리뷰와 CI를 통과한 뒤 dev에 병합하며, 충분히 안정화된 경우에만 main으로 승격합니다. -->

### Pull Request Expectations
- At least one teammate review
- Passing CI checks (GitHub Actions)
- Updated docs when behavior changes
- Clear summary, test steps, and scope in PR body
<!-- 한국어 설명: PR에는 최소 1명의 리뷰, 통과한 CI, 필요한 문서 수정, 명확한 요약과 테스트 방법이 포함되어야 합니다. -->

### Branch Naming Examples
- `feature/cli-router`
- `fix/python-import-path`
- `docs/dependency-workflow`
- `chore/github-actions-ci`
- `hotfix/critical-subprocess-crash`
<!-- 한국어 설명: 브랜치 이름은 작업 목적이 드러나도록 feature/fix/docs/chore/hotfix 접두사를 사용합니다. -->

### detoks Repository Policy
```text
Default branch:        dev
Protected branch(es):  main, dev
Required approvals:    1
Required status checks: CI (GitHub Actions)
Direct push policy:    Not allowed on dev or main
Release branch policy: Promote dev → main for stable milestones only
Emergency hotfix process: branch hotfix/* from main → PR to main → backmerge to dev
```
<!-- 한국어 설명: detoks 저장소의 실제 운영 정책입니다. 직접 푸시 금지, CI 통과 및 리뷰 1명 필수, 긴급 수정은 hotfix 브랜치를 통해 main과 dev 모두에 반영합니다. -->
