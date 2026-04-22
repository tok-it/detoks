# 🚀 detoks

detoks는 LLM CLI(codex, gemini 등) 앞단에서 동작하는 **interactive wrapper shell**로,  
입력·출력·세션을 최적화하여 **토큰 사용을 줄이고 개발 효율을 극대화**하는 시스템이다.

---

## 🎯 핵심 가치

- 불필요한 토큰 사용 최소화
- 반복 작업 제거
- LLM 워크플로우 최적화
- 개발 생산성 향상

---

## 🧠 한 줄 정의

> detoks는 LLM 사용 방식을 재설계하여 토큰과 컨텍스트를 최적화하는 CLI 시스템이다

---

## 📌 문제

- 반복되는 컨텍스트 전달
- 과도한 출력
- 토큰 제한으로 인한 작업 중단

---

## 💡 해결

- 입력 정제
- 출력 압축
- 상태 기반 세션 관리

---

## 🏗 구조
User → detoks → LLM CLI → detoks → Output

---

## 📂 Docs

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [DEPENDENCY_WORKFLOW.md](./docs/DEPENDENCY_WORKFLOW.md)
- [PIPELINE.md](./docs/PIPELINE.md)
- [SCHEMAS.md](./docs/SCHEMAS.md)
- [ENGINEERING_GUIDELINES.md](./docs/ENGINEERING_GUIDELINES.md)
- [ROLES.md](./docs/ROLES.md)
- [PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md)
- [STACK_VERSIONS.md](./docs/STACK_VERSIONS.md)

---

## 🧩 팀 의존성 명령

의존성은 항상 **프로젝트 루트**를 단일 기준점으로 관리합니다.

- TypeScript 의존성 → `package.json`
- Python 의존성 → `pyproject.toml`

권장 명령어:

```bash
detoks-add-ts-dep <package>
detoks-add-ts-dev-dep <package>
detoks-add-py-dep <package>
detoks-add-py-dev-dep <package>
```

예시:

```bash
detoks-add-ts-dep chalk
detoks-add-ts-dev-dep vitest
detoks-add-py-dep pydantic
detoks-add-py-dev-dep pytest
```

만약 단축 명령을 아직 사용할 수 없다면, 팀원은 아래 두 가지 방식 중 하나를 선택할 수 있습니다.

1. 저장소의 `scripts/` 디렉터리를 `PATH`에 추가
2. 프로젝트 루트에서 스크립트를 직접 실행

```bash
./scripts/add-ts-dep.sh <package>
./scripts/add-ts-dev-dep.sh <package>
./scripts/add-py-dep.sh <package>
./scripts/add-py-dev-dep.sh <package>
```

### macOS / Linux (`zsh`, `bash`)

셸의 `PATH`에 저장소의 `scripts/` 디렉터리를 추가합니다.

```bash
echo 'export PATH="<repo-path>/scripts:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

예시:

```bash
echo 'export PATH="/Users/choi/Desktop/workspace/detoks/scripts:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

설정 후에는 어느 작업 디렉터리에서든 아래처럼 바로 실행할 수 있습니다.

```bash
detoks-add-ts-dep chalk
detoks-add-py-dep pydantic
```

### Windows (PowerShell)

PowerShell 프로필에 저장소의 `scripts/` 디렉터리를 추가합니다.

```powershell
Add-Content -Path $PROFILE -Value '$env:Path = "<repo-path>\\scripts;" + $env:Path'
. $PROFILE
```

예시:

```powershell
Add-Content -Path $PROFILE -Value '$env:Path = "C:\\workspace\\detoks\\scripts;" + $env:Path'
. $PROFILE
```

설정 후에는 어느 작업 디렉터리에서든 동일한 명령을 바로 실행할 수 있습니다.

```powershell
detoks-add-ts-dep chalk
detoks-add-py-dep pydantic
```

만약 팀원이 `PATH`를 수정하고 싶지 않다면, 프로젝트 루트에서 `./scripts/...` 명령으로 직접 실행해도 됩니다.
