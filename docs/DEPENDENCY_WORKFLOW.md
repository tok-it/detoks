# Dependency Workflow

Use the repository root as the single source of truth for dependencies:

- TypeScript dependencies -> `package.json`
- Python dependencies -> `pyproject.toml`

<!-- 한국어 설명: 의존성은 루트 파일 하나씩만 관리하고, 하위 폴더별로 별도 패키지 관리 파일을 만들지 않습니다. -->

## Why

- avoids scattered dependency files
- keeps version control simple
- prevents team members from adding packages in inconsistent places

<!-- 한국어 설명: 이렇게 하면 의존성 위치가 분산되지 않고, 팀원마다 다른 위치에 라이브러리를 추가하는 문제를 막을 수 있습니다. -->

## TypeScript Workflow

For TypeScript dependencies, use the standard npm commands from the repository root:

```bash
npm install <package>
npm install -D <package>
npm install
```

Examples:

```bash
npm install zod
npm install -D vitest
npm install
```

<!-- 한국어 설명: TypeScript 팀원은 기존 npm 설치 방식을 그대로 사용하며, 루트에서 실행하면 package.json 기준으로 정상 반영됩니다. -->

## Python Helper Commands

For Python dependencies, keep using the shared commands so `pyproject.toml` is updated consistently:

```bash
npm run add:py -- <package>
npm run add:py:dev -- <package>
```

Examples:

```bash
npm run add:py -- pydantic
npm run add:py:dev -- pytest
```

<!-- 한국어 설명: Python은 pip install만으로는 pyproject.toml이 갱신되지 않으므로, 공통 명령을 통해 선언과 설치를 함께 관리합니다. -->

## Rules

- Do not create extra `package.json` files under `src/*`.
- Do not create extra `pyproject.toml` files under `python/llama-server/*`.
- If a dependency is shared by multiple TypeScript modules, add it once at the root.
- If a dependency is needed only for llama-server Python work, still add it to the root `pyproject.toml`.

<!-- 한국어 설명: 언어별 의존성은 루트에서만 선언하고, 역할별 하위 폴더에는 별도 패키지 기준 파일을 만들지 않는 것이 팀 규칙입니다. -->

## Tooling Note

Python dependency management in this project assumes `uv`.

If `uv` is not installed yet, install it first and then use the helper scripts.

<!-- 한국어 설명: Python 의존성 관리는 uv를 기준으로 하며, 설치되지 않은 경우 먼저 uv를 준비한 뒤 스크립트를 사용해야 합니다. -->
