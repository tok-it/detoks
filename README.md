# detoks

<p align="right">
  <a href="#-한국어">한국어</a> | <a href="#-english">English</a>
</p>

<p align="center">
  <img src="./content.png" alt="detoks preview" width="720" />
</p>

---

## 🇰🇷 한국어

### detoks란?

detoks는 `codex`, `gemini` 같은 LLM CLI 앞단에서 동작하는 **interactive wrapper CLI**입니다.  
입력을 작업 단위로 정리하고, task graph / context / state / execution boundary를 관리해서 **LLM CLI 작업 흐름을 더 안정적이고 재현 가능하게** 만드는 것이 목표입니다.

### 현재 프로젝트 성격

- **CLI 런타임 UX**
  - one-shot 실행
  - REPL 모드
  - `--help`, `repl --help`
  - `--adapter`, `--execution-mode`, `--verbose`
- **파이프라인 골격**
  - sentence split
  - task graph build
  - context build / compression
  - adapter / subprocess boundary
  - session state save
- **실행 모드**
  - `stub`: 시뮬레이션 경로
  - `real`: 실제 subprocess 경로
- **테스트**
  - `Vitest` 기반 unit / integration / smoke test
  - `TypeScript` typecheck

### 현재 상태

현재 `detoks`는 **CLI / REPL / 상태 관리 / adapter 경계 / subprocess 경계 / 테스트 기반 UX 안정화**까지 진행된 상태입니다.

아직 진행 중인 큰 축:

- Prompt / Translate / Guardrails / LLM client 실제 연결
- real execution path end-to-end 보강
- session / checkpoint UX 고도화

자세한 현재 진행도는 아래 문서를 참고하세요.

- [`docs/PIPELINE.md`](./docs/PIPELINE.md)
- [`docs/ROLES.md`](./docs/ROLES.md)
- [`docs/PROJECT_STRUCTURE.md`](./docs/PROJECT_STRUCTURE.md)
- [`docs/TESTING_GUIDE.md`](./docs/TESTING_GUIDE.md)

### 구조 한 줄 요약

```text
User Input → detoks CLI → Task Graph / Context / State → Adapter / Subprocess → Output
```

### 개발 명령

```bash
npm install
npm run build
npm run typecheck
npm test
npm run cli -- --help
```

REPL 예시:

```bash
npm run cli -- repl --adapter codex --execution-mode stub
```

one-shot 예시:

```bash
npm run cli -- "summarize the current repo status"
```

### 문서

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [API_SPEC.md](./docs/API_SPEC.md)
- [PIPELINE.md](./docs/PIPELINE.md)
- [ROLES.md](./docs/ROLES.md)
- [PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md)
- [TESTING_GUIDE.md](./docs/TESTING_GUIDE.md)
- [DEPENDENCY_WORKFLOW.md](./docs/DEPENDENCY_WORKFLOW.md)
- [ENGINEERING_GUIDELINES.md](./docs/ENGINEERING_GUIDELINES.md)
- [SCHEMAS.md](./docs/SCHEMAS.md)
- [STACK_VERSIONS.md](./docs/STACK_VERSIONS.md)

### 의존성 관리

프로젝트 루트 기준:

- TypeScript 의존성: `npm install`, `npm install -D`
- Python 의존성: `npm run add:py -- ...`, `npm run add:py:dev -- ...`

예시:

```bash
npm install chalk
npm install -D vitest
npm run add:py -- pydantic
npm run add:py:dev -- pytest
```

---

## 🇺🇸 English

### What is detoks?

detoks is an **interactive wrapper CLI** that sits in front of LLM CLIs such as `codex` and `gemini`.  
Its goal is to make LLM CLI work more stable and reproducible by organizing input into work units and managing task graph, context, state, and execution boundaries.

### Current project scope

- **CLI runtime UX**
  - one-shot execution
  - REPL mode
  - `--help`, `repl --help`
  - `--adapter`, `--execution-mode`, `--verbose`
- **Pipeline skeleton**
  - sentence split
  - task graph build
  - context build / compression
  - adapter / subprocess boundary
  - session state save
- **Execution modes**
  - `stub`: simulated path
  - `real`: actual subprocess path
- **Testing**
  - `Vitest`-based unit / integration / smoke tests
  - `TypeScript` typecheck

### Current status

detoks currently has **CLI / REPL / state management / adapter boundaries / subprocess boundaries / test-backed UX stabilization** in place.

Major areas still in progress:

- real Prompt / Translate / Guardrails / LLM client wiring
- end-to-end real execution path coverage
- session / checkpoint UX improvements

For more detail, see:

- [`docs/PIPELINE.md`](./docs/PIPELINE.md)
- [`docs/ROLES.md`](./docs/ROLES.md)
- [`docs/PROJECT_STRUCTURE.md`](./docs/PROJECT_STRUCTURE.md)
- [`docs/TESTING_GUIDE.md`](./docs/TESTING_GUIDE.md)

### One-line structure

```text
User Input → detoks CLI → Task Graph / Context / State → Adapter / Subprocess → Output
```

### Development commands

```bash
npm install
npm run build
npm run typecheck
npm test
npm run cli -- --help
```

REPL example:

```bash
npm run cli -- repl --adapter codex --execution-mode stub
```

One-shot example:

```bash
npm run cli -- "summarize the current repo status"
```

### Documentation

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [API_SPEC.md](./docs/API_SPEC.md)
- [PIPELINE.md](./docs/PIPELINE.md)
- [ROLES.md](./docs/ROLES.md)
- [PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md)
- [TESTING_GUIDE.md](./docs/TESTING_GUIDE.md)
- [DEPENDENCY_WORKFLOW.md](./docs/DEPENDENCY_WORKFLOW.md)
- [ENGINEERING_GUIDELINES.md](./docs/ENGINEERING_GUIDELINES.md)
- [SCHEMAS.md](./docs/SCHEMAS.md)
- [STACK_VERSIONS.md](./docs/STACK_VERSIONS.md)

### Dependency management

From the project root:

- TypeScript dependencies: `npm install`, `npm install -D`
- Python dependencies: `npm run add:py -- ...`, `npm run add:py:dev -- ...`

Examples:

```bash
npm install chalk
npm install -D vitest
npm run add:py -- pydantic
npm run add:py:dev -- pytest
```
