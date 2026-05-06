# detoks

detoks는 LLM CLI(codex, gemini, claude 등) 앞단에서 동작하는 **interactive wrapper shell**로,
입력·출력·세션을 최적화하여 **토큰 사용을 줄이고 개발 효율을 극대화**하는 시스템입니다.

---

## 🔔 업데이트 안내

`claude` 어댑터가 포함된 새 버전을 사용하려면, 설치된 detoks를 최신 릴리스로 업데이트하세요.

- 전역 설치: `npm install -g @sorlros/detoks@latest`
- 전역 업데이트: `npm update -g @sorlros/detoks`
- 로컬 설치: `npm install @sorlros/detoks@latest`

새 기능과 변경점은 GitHub Releases 또는 릴리스 노트에서 함께 안내하는 것을 권장합니다.

detoks는 `codex`, `gemini`, `claude` 같은 LLM CLI 앞단에서 동작하는 **interactive wrapper CLI**입니다.
입력, 컨텍스트, 세션, 실행 경계를 정리해 **LLM CLI 작업 흐름을 더 안정적이고 재현 가능하게** 만드는 것이 목표입니다.

## 🔔 업데이트 안내

`claude` 어댑터가 포함된 새 버전을 사용하려면, 설치된 detoks를 최신 릴리스로 업데이트하세요.

- 전역 설치: `npm install -g @sorlros/detoks@latest`
- 전역 업데이트: `npm update -g @sorlros/detoks`
- 로컬 설치: `npm install @sorlros/detoks@latest`

새 기능과 변경점은 GitHub Releases 또는 릴리스 노트에서 함께 안내하는 것을 권장합니다.

<p align="center">
  <img src="./content.png" alt="detoks preview" width="720" />
</p>

## 한눈에 보기

- one-shot 실행과 REPL 모드 지원
- task graph / context / state 관리
- adapter / subprocess 경계 분리
- `stub` / `real` 실행 모드
- 세션 저장 및 재개 기반 워크플로우

## 요구 사항

- Node.js `>=24.15.0 <26`
- `codex`, `gemini`, 또는 `claude` CLI: 해당 adapter를 사용할 때
- 로컬 `llama-server` 사용 시 Python `3.13.x`

자세한 버전 기준은 [STACK_VERSIONS.md](./docs/STACK_VERSIONS.md)와 [LLAMA_CPP_SERVER_SPEC.md](./docs/LLAMA_CPP_SERVER_SPEC.md)를 참고하세요.

## 설치

### 1) 로컬 설치

현재 폴더에 설치합니다. 어느 경로에서든 실행할 수 있지만, 설치 결과는 현재 디렉터리의 `node_modules`에 들어갑니다.

```bash
npm install @sorlros/detoks
```

프로젝트 안에서 CLI를 실행할 때:

```bash
npx detoks --help
```

### 2) 전역 설치

```bash
npm install -g @sorlros/detoks
```

설치 후 어디서나 바로 실행할 때:

```bash
detoks --help
```

### 3) 설치 없이 바로 실행

```bash
npx @sorlros/detoks --help
```

## 빠른 시작

```bash
detoks --help
detoks repl
detoks "summarize the current repo status"
```

REPL 예시:

```bash
detoks repl --adapter codex --execution-mode stub
```

## detoks가 해주는 일

1. 입력을 작업 단위로 정리
2. task graph와 의존성을 구성
3. 현재 실행에 필요한 context만 주입
4. adapter / subprocess boundary를 통해 실행
5. 결과를 세션에 저장해 다음 실행에서 재사용

## 문서

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [PIPELINE.md](./docs/PIPELINE.md)
- [PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md)
- [STACK_VERSIONS.md](./docs/STACK_VERSIONS.md)
- [DEPENDENCY_WORKFLOW.md](./docs/DEPENDENCY_WORKFLOW.md)
- [TESTING_GUIDE.md](./docs/TESTING_GUIDE.md)
- [ROLES.md](./docs/ROLES.md)
- [ENGINEERING_GUIDELINES.md](./docs/ENGINEERING_GUIDELINES.md)
- [SCHEMAS.md](./docs/SCHEMAS.md)

## Windows 사용

Windows native 실행은 지원하지 않으며, WSL Ubuntu에서 실행합니다.
자세한 설치/실행 절차는 [README.ko.md](./README.ko.md) 및 [LLAMA_CPP_SERVER_SPEC.md](./docs/LLAMA_CPP_SERVER_SPEC.md)를 참고하세요.
