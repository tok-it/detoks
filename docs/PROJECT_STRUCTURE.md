# 📁 Project Structure

detoks는 **TypeScript 애플리케이션 + Python llama.cpp 서버** 경계를 유지하는 구조를 기본으로 합니다.

## 대표 디렉터리

```text
detoks/
├── docs/
├── python/
│   ├── llama-server/
│   └── llama_server/
├── scripts/
├── src/
│   ├── cli/
│   ├── core/
│   ├── integrations/
│   ├── schemas/
│   ├── types/
│   └── utils/
└── tests/
    ├── python/
    └── ts/
```

> 이 트리는 대표 구조만 보여 줍니다. 세부 파일 이동 계획은 [FOLDER_STRUCTURE.md](FOLDER_STRUCTURE.md)가 아니라 실제 디렉터리 상태를 기준으로 판단해야 합니다.

## 주요 책임

- `python/llama-server`, `python/llama_server`
  - llama.cpp 서버 실행, 설정, Python 런타임 경계
- `src/cli`
  - CLI entrypoint, REPL, TUI, 사용자 입력 흐름
- `src/core`
  - 파이프라인, 번역, 압축, guardrails, task graph, state, executor
- `src/integrations`
  - 외부 CLI / subprocess / adapter 경계
- `src/schemas`
  - Zod 기반 런타임 계약 정의
- `tests/ts`, `tests/python`
  - TypeScript / Python 검증 경계

## 소유 경계

- Python은 **llama.cpp inference server 전용**입니다.
- 애플리케이션 로직은 TypeScript `src/**`에 둡니다.
- Role 1 관련 핵심 구현은 `src/core/translate`, `src/core/prompt`, `src/core/guardrails`에 모입니다.
- LLM 호출 경계는 `src/core/llm-client`를 통해 통일합니다.
- 외부 도구 연동은 `src/integrations/**`에 격리합니다.

## 읽을 때의 기준

- 시스템 구조를 보려면 [ARCHITECTURE.md](ARCHITECTURE.md)
- 파이프라인 단계를 보려면 [PIPELINE.md](PIPELINE.md)
- 데이터 계약을 보려면 [SCHEMAS.md](SCHEMAS.md)
- 세부 문서 맵을 보려면 [INDEX.md](INDEX.md)
