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

## Helper Scripts

From anywhere in the repository, run:

```bash
./scripts/add-ts-dep.sh <package>
./scripts/add-ts-dev-dep.sh <package>
./scripts/add-py-dep.sh <package>
./scripts/add-py-dev-dep.sh <package>
```

Examples:

```bash
./scripts/add-ts-dep.sh zod
./scripts/add-ts-dev-dep.sh vitest
./scripts/add-py-dep.sh pydantic
./scripts/add-py-dev-dep.sh pytest
```

<!-- 한국어 설명: 스크립트는 현재 작업 위치와 관계없이 자동으로 프로젝트 루트로 이동해 올바른 기준 파일에 의존성을 추가합니다. -->

## Recommended Shortcut Setup

For the best developer experience, add the repository `scripts/` directory to your shell `PATH`.

```bash
export PATH="<repo-path>/scripts:$PATH"
```

After that, team members can run these commands from any working directory:

```bash
detoks-add-ts-dep <package>
detoks-add-ts-dev-dep <package>
detoks-add-py-dep <package>
detoks-add-py-dev-dep <package>
```

Examples:

```bash
detoks-add-ts-dep chalk
detoks-add-ts-dev-dep vitest
detoks-add-py-dep pydantic
detoks-add-py-dev-dep pytest
```

<!-- 한국어 설명: scripts 디렉터리를 PATH에 추가하면 팀원은 현재 어느 폴더에서 작업 중이든 짧은 전용 명령으로 의존성을 추가할 수 있습니다. -->

### macOS / Linux (`zsh`, `bash`)

For `zsh`, add this line to `~/.zshrc`:

```bash
export PATH="<repo-path>/scripts:$PATH"
```

Then reload your shell:

```bash
source ~/.zshrc
```

Example:

```bash
export PATH="/Users/choi/Desktop/workspace/detoks/scripts:$PATH"
```

<!-- 한국어 설명: macOS 또는 Linux에서 zsh/bash를 쓰는 경우, PATH에 scripts 디렉터리를 등록하면 새 터미널에서도 항상 명령을 바로 사용할 수 있습니다. -->

### Windows (PowerShell)

Add the repository `scripts` directory to your PowerShell profile:

```powershell
Add-Content -Path $PROFILE -Value '$env:Path = "<repo-path>\\scripts;" + $env:Path'
. $PROFILE
```

Example:

```powershell
Add-Content -Path $PROFILE -Value '$env:Path = "C:\\workspace\\detoks\\scripts;" + $env:Path'
. $PROFILE
```

<!-- 한국어 설명: Windows에서는 PowerShell 프로필에 scripts 경로를 추가하면 이후 어느 폴더에서든 전용 명령을 사용할 수 있습니다. -->

## Rules

- Do not create extra `package.json` files under `src/*`.
- Do not create extra `pyproject.toml` files under `python/role1/*`.
- If a dependency is shared by multiple TypeScript modules, add it once at the root.
- If a dependency is needed only for Role 1 Python work, still add it to the root `pyproject.toml`.

<!-- 한국어 설명: 언어별 의존성은 루트에서만 선언하고, 역할별 하위 폴더에는 별도 패키지 기준 파일을 만들지 않는 것이 팀 규칙입니다. -->

## Tooling Note

Python dependency management in this project assumes `uv`.

If `uv` is not installed yet, install it first and then use the helper scripts.

<!-- 한국어 설명: Python 의존성 관리는 uv를 기준으로 하며, 설치되지 않은 경우 먼저 uv를 준비한 뒤 스크립트를 사용해야 합니다. -->
