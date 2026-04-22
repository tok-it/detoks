# Stack Versions

This file defines the initial version baseline for **detoks**.
<!-- 한국어 설명: 이 문서는 detoks 프로젝트에서 사용할 언어, 런타임, 라이브러리 버전의 초기 기준선을 정의합니다. -->

## Version Matrix

| Area | Tool / Library | Version | Why this version |
| --- | --- | --- | --- |
| TypeScript runtime | Node.js | `24.15.0` | Current LTS line and the safest production baseline for the main CLI/runtime layer. |
| TypeScript language | TypeScript | `5.8.3` | Stable TypeScript baseline for strict mode, NodeNext modules, and the current Node runtime. |
| TS execution | tsx | `4.20.5` | Lightweight TypeScript runner for local execution without a separate build step. |
| TS validation | zod | `4.1.5` | TypeScript-side schema validation and typing source of truth. |
| TS testing | vitest | `3.2.4` | Fast unit/integration testing for the TypeScript layers. |
| TS Node types | `@types/node` | `24.3.1` | Matches the Node 24 runtime family used by this project. |
| Python runtime | Python | `3.13.13` | Mature maintenance release with installers, safer for team standardization than Python 3.14.x. |
| Python validation | pydantic | `2.13.3` | Current stable validation layer for Role 1 schemas and structured outputs. |
| Python testing | pytest | `9.0.3` | Current stable test runner for Python 3.13-compatible Role 1 modules. |
| Python linting | ruff | `0.15.9` | Fast lint/format gate for the Python-only Role 1 area. |
| Python typing | mypy | `1.20.1` | Static typing checks for Role 1 modules and boundary contracts. |
<!-- 한국어 설명: 위 표는 TypeScript 영역과 Python Role 1 영역이 함께 동작할 수 있도록 호환성을 고려해 정한 공통 버전 기준입니다. -->

## Language Boundary Rules

- **Role 1 only** uses Python under `python/role1`.
- **Roles 2.1, 2.2, and 3** use TypeScript under `src`.
- The TypeScript application must talk to Role 1 Python code through `src/integrations/role1-python`.
<!-- 한국어 설명: Python은 Role 1에만 한정하고, 나머지 역할은 TypeScript를 사용하며, 두 언어는 명시적인 integration 경계를 통해 연결해야 합니다. -->

## Standard Library Versions

These are not pinned as separate packages because they are versioned by the language runtime itself:

- Node standard library: `child_process`, `fs`, `readline/promises`
- Python standard library: modules shipped with Python `3.13.13`
<!-- 한국어 설명: 표준 라이브러리는 별도 패키지 버전으로 관리하지 않고, 각 언어 런타임 버전에 종속되는 것으로 간주합니다. -->

## Deliberate Non-Choice

No external prompt UI package is pinned yet.
<!-- 한국어 설명: 프롬프트 UI용 외부 패키지는 아직 확정하지 않았으며, 초기 단계에서는 의존성을 최소화하기 위해 보류했습니다. -->

Reason:

- the current project docs mention `readline / prompts` for REPL work,
- but the initial scaffold can safely start with the Node standard library,
- which reduces dependency surface and avoids locking into an old prompt package too early.
<!-- 한국어 설명: 현재 문서에는 readline/prompts가 언급되지만, 우선은 Node 내장 기능으로 시작하는 편이 더 단순하고 안전하다고 판단했습니다. -->

If the REPL later needs richer interactive flows, choose and pin that package in a dedicated follow-up change.
<!-- 한국어 설명: 이후 REPL 요구사항이 복잡해지면 그때 별도 변경으로 적절한 패키지를 선정하고 버전을 고정하면 됩니다. -->

## Files That Enforce This Baseline

- `.nvmrc`
- `.python-version`
- `package.json`
- `tsconfig.json`
- `pyproject.toml`
<!-- 한국어 설명: 위 파일들은 실제 개발 환경과 의존성 버전을 강제하거나 문서화하는 기준 파일들입니다. -->
