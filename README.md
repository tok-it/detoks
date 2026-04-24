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
- [DES_DATA_FLOW.md](./docs/DES_DATA_FLOW.md)
- [PIPELINE.md](./docs/PIPELINE.md)
- [SCHEMAS.md](./docs/SCHEMAS.md)
- [SHARED_DATA_FLOW.md](./docs/SHARED_DATA_FLOW.md)
- [ENGINEERING_GUIDELINES.md](./docs/ENGINEERING_GUIDELINES.md)
- [ROLES.md](./docs/ROLES.md)
- [PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md)
- [STACK_VERSIONS.md](./docs/STACK_VERSIONS.md)

---

## 🧩 팀 의존성 명령

의존성은 항상 **프로젝트 루트**를 단일 기준점으로 관리합니다.

- TypeScript 의존성 → `package.json`
- Python 의존성 → `pyproject.toml`

팀 공통 권장 방식:

```bash
npm install <package>
npm install -D <package>
npm run add:py -- <package>
npm run add:py:dev -- <package>
```

예시:

```bash
npm install chalk
npm install -D vitest
npm run add:py -- pydantic
npm run add:py:dev -- pytest
```

### 왜 이 방식을 쓰나?

- TypeScript는 기존 `npm i` / `npm install -D` 사용 습관을 그대로 유지 가능
- Python은 `pyproject.toml` 반영을 위해 공통 명령을 유지
- 의존성은 항상 루트 기준 파일에만 반영됨
- TypeScript와 Python의 관리 방식을 역할에 맞게 분리 가능

### 팀원 적용 방법

1. 최신 코드 받기

```bash
git pull
```

2. Node 의존성 최신화

```bash
npm install
```

3. Python 의존성 추가가 필요한 팀원은 `uv` 설치 확인

```bash
uv --version
```

4. 이후부터는 TypeScript와 Python을 아래 기준으로 사용

```bash
npm install <package>
npm install -D <package>
npm run add:py -- <package>
npm run add:py:dev -- <package>
```

### 사용 규칙

- TypeScript 일반 의존성 → `npm install ...`
- TypeScript 개발 의존성 → `npm install -D ...`
- Python 일반 의존성 → `npm run add:py -- ...`
- Python 개발 의존성 → `npm run add:py:dev -- ...`
- 하위 폴더에 별도 `package.json` 또는 `pyproject.toml`을 만들지 않음

### 참고

- 위 명령은 **프로젝트 루트에서 실행하는 것**을 기준으로 합니다.
- Python 의존성 추가는 `uv`가 설치되어 있어야 합니다.
- TypeScript 팀원은 기존 `npm i`, `npm install -D`, `npm install`을 그대로 사용합니다.
- Python 팀원만 `npm run add:py*` 또는 `uv add` 계열을 사용합니다.
