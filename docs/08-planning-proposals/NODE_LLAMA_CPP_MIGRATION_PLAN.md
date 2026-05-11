# node-llama-cpp 전환 설계안

## 목적

이 문서의 목표는 detoks를 **완전 Node only** 상태로 전환하기 위한 실제 작업 순서를 고정하는 것이다.

이 문서에서 말하는 "완전 Node only"의 완료 기준은 아래와 같다.

1. Role 1 추론이 `node-llama-cpp` in-process 경로만으로 동작한다.
2. prompt compression에서 Python worker가 사라진다.
3. PTY transcript에서 Python fallback이 사라진다.
4. `python/`, `pyproject.toml`, `.python-version`, Python helper script, Python 전제 문서가 제거된다.

## 현재 상태

현재 저장소는 아직 완전 Node only가 아니다.

- Role 1 추론은 `node-llama-cpp` in-process 경로를 이미 일부 사용한다.
- `src/core/llm-client/local-runtime.ts`는 전환기 안전장치로 `llama-server` fallback도 유지한다.
- prompt compression은 아직 Python Kompress worker 경계를 사용한다.
- PTY transcript 경로는 아직 Python fallback을 먼저 시도한다.
- 설정의 source of truth는 여전히 `.env` / `.env.local`의 `LOCAL_LLM_*`, `KOMPRESS_*` 키다.

즉, 지금 해야 하는 일은 "node-llama-cpp로 바꿀 수 있는지 검토"가 아니라, **남아 있는 Python 경계를 어떤 순서로 제거할지 확정하는 것**이다.

## 비목표

이번 전환의 비목표는 다음과 같다.

- 스트리밍 API 도입
- OpenAI 전체 API surface 구현
- 멀티 모델 동시 라우팅
- 배치 추론 최적화 1차 완성
- Kompress 압축 정책/모델 자체 재설계
- Role 1 번역 프롬프트 자체 개편

이번 전환은 `chat/completions` 호환성 유지, 안정적인 런타임 교체, Python 경계 제거에 집중한다.

## 권장 작업 순서

### 1. Role 1 in-process 런타임 확정

수정 대상:

- `src/core/llm-client/node-llama-runtime.ts`
- `src/core/llm-client/local-runtime.ts`
- `src/core/llm-client/client.ts`
- `src/core/translate/translate.ts`
- `scripts/verify-role1.ts`

목표:

- `node-llama-cpp`가 SuperGemma4/Gemma4를 실제로 로드하고 `verify:role1`이 성공하게 만든다.

커밋 단위:

- `feat(role1): stabilize in-process node-llama runtime`

검증:

- `npm run typecheck`
- `npm test -- --run tests/ts/unit/core/llm-client/client.test.ts tests/ts/unit/core/llm-client/local-runtime.test.ts tests/ts/unit/core/translate/translate.test.ts tests/ts/unit/scripts/verify-role1.test.ts`
- `npm run verify:role1 -- --prompt "새 파일을 생성해" --runtime-provider node-llama-cpp`

완료 기준:

- `verify:role1`이 성공한다.
- 로컬 포트를 여는 서버 없이 동작한다.

예상 충돌:

- `node-llama-cpp`의 현재 backend가 Gemma4/SuperGemma4 GGUF를 직접 못 읽으면 이 단계가 시작점에서 막힌다.
- `llama-server`와 `node-llama-cpp`의 chat wrapper, stop token, sampling 차이로 결과 parity가 흔들릴 수 있다.
- in-process 특성상 모델 로드 실패나 메모리 문제가 메인 Node 프로세스에 직접 영향을 줄 수 있다.

### 2. Kompress를 Python worker에서 Node 구현으로 교체

수정 대상:

- `src/core/prompt/kompress-client.ts`
- `src/core/prompt/compression.ts`
- `src/core/prompt/config.ts`
- 필요 시 새 Node 압축 모듈 추가

전략:

- 외부 계약인 `compression_provider: "kompress"`는 유지한다.
- 내부 구현만 Node로 바꾼다.
- 1차는 heuristic-safe compressor로 Python 제거를 달성한다.
- 2차가 필요하면 Node-native 모델 압축을 붙인다.

커밋 단위:

- `refactor(prompt): replace python kompress worker with node compressor`

검증:

- `npm run typecheck`
- `npm test -- --run tests/ts/unit/core/prompt/compression.test.ts tests/ts/unit/core/prompt/compiler.test.ts tests/ts/unit/core/pipeline/orchestrator.test.ts`
- `npm run verify:role1 -- --file tests/data/row_data.json --limit 3 --runtime-provider node-llama-cpp`

완료 기준:

- compression 경로에서 `python`, `uv`, `llama_server.kompress_worker` spawn이 0회다.

예상 충돌:

- Python `kompress-base`와 동일한 압축 품질을 Node에서 즉시 재현하지 못할 수 있다.
- 압축 품질보다 placeholder 보존과 safe fallback이 더 중요하므로 guardrail 회귀를 먼저 막아야 한다.
- `kompress-client.ts`, `compression.ts`, config/test fixture가 동시에 바뀌어 생각보다 범위가 커질 수 있다.

### 3. PTY transcript 경로를 Node로 교체

수정 대상:

- `src/integrations/subprocess/runner.ts`
- `package.json`
- 필요 시 `node-pty` 추가

전략:

- `buildPythonInvocation()`을 제거한다.
- `node-pty` 기반 transcript 실행으로 통일한다.
- `expect`/`script` fallback은 보조로 남길 수 있지만 Python fallback은 제거한다.

커밋 단위:

- `refactor(subprocess): replace python pty fallback with node runtime`

검증:

- `npm run typecheck`
- `npm test -- --run tests/ts/unit/integrations/subprocess/runner.test.ts tests/ts/unit/integrations/adapters/real-path.test.ts tests/ts/integration/tui-korean-input.test.ts tests/ts/integration/cli-smoke.test.ts`

완료 기준:

- real adapter transcript가 Python 없이 유지된다.
- `runner.ts`에 `python3`/`pty.spawn` 경로가 사라진다.

예상 충돌:

- `node-pty`는 네이티브 의존이라 macOS 로컬과 CI에서 빌드/설치 이슈가 날 수 있다.
- 현재 Python fallback이 흡수하던 입력/출력 edge case가 Node PTY 구현에서 다르게 드러날 수 있다.
- transcript 이벤트 타이밍이 바뀌면 TUI, real adapter, CLI smoke 테스트가 연쇄적으로 흔들릴 수 있다.

### 4. Python 설정과 런타임 키 제거

수정 대상:

- `src/core/prompt/config.ts`
- 관련 테스트들
- `.env` 문서들
- CLI 도움말

삭제 대상:

- `KOMPRESS_PYTHON_BIN`
- `KOMPRESS_STARTUP_TIMEOUT`
- 그 외 Python 전용 설정 표면

커밋 단위:

- `chore(config): remove python-specific runtime settings`

검증:

- `npm run typecheck`
- `npm test -- --run tests/ts/unit/core/prompt/config.test.ts tests/ts/unit/scripts/verify-role1.test.ts tests/ts/unit/scripts/benchmark-pipeline.test.ts`

완료 기준:

- 설정 스키마와 테스트에서 Python 전용 env 키가 사라진다.

예상 충돌:

- 설정 키를 먼저 지우면 아직 남아 있는 Python 경로가 조용히 깨질 수 있다.
- `.env` 예시, 테스트 fixture, 문서의 env 표기가 서로 다른 시점으로 어긋날 수 있다.
- 사용자의 로컬 `.env`에 남아 있는 오래된 키가 혼선을 줄 수 있다.

### 5. Python 파일과 패키징 자산 삭제

삭제 대상:

- `python/llama_server`
- `pyproject.toml`
- `.python-version`
- `package.json`의 `add:py`, `add:py:dev`
- `scripts/todo-compare/*.sh`의 inline Python

주의:

- 예시 문자열인 `````python` 코드펜스` 같은 테스트 데이터는 런타임 의존이 아니므로 무조건 지울 필요는 없다.

커밋 단위:

- `chore(node-only): remove python runtime and packaging artifacts`

검증:

- `rg -n "python3|python|pyproject|kompress_worker|llama_server" src scripts tests docs package.json README*`
- `npm run build`
- `npm test`

완료 기준:

- 런타임, 설정, 패키징 차원의 Python 의존이 0이다.

예상 충돌:

- `scripts/todo-compare/*` 같은 보조 스크립트가 메인 런타임보다 늦게 정리되면 "아직 Python 필요" 상태가 남을 수 있다.
- 문서나 CI보다 파일 삭제가 먼저 들어가면 저장소가 일시적으로 자기 설명과 맞지 않게 된다.
- 삭제 범위가 커서 한 PR에 몰리면 리뷰와 롤백이 어려워질 수 있다.

### 6. 문서와 스펙을 Node only 기준으로 재작성

수정 대상:

- `docs/PROJECT_STRUCTURE.md`
- `docs/STACK_VERSIONS.md`
- `docs/DEPENDENCY_WORKFLOW.md`
- `docs/CLI_WRAPPER_PIPELINE.md`
- `docs/API_SPEC.md`
- `README.md` 계열

커밋 단위:

- `docs(node-only): rewrite runtime boundary and dependency docs`

검증:

- `rg -n "Python|pyproject|Kompress worker|python/llama_server" docs README*`

완료 기준:

- 문서가 더 이상 Python worker나 utility fallback을 전제하지 않는다.

예상 충돌:

- 문서 일부가 여전히 sidecar, Python worker, Python fallback을 전제로 설명하면 실제 구현보다 오래된 경계가 더 강하게 보일 수 있다.
- 실험성 문서나 예시 명령에 Python이 남아 있으면 최종 인상에 혼선을 줄 수 있다.
- 문서 수정이 늦으면 구현 완료 후에도 저장소가 Node-only가 아닌 것처럼 보일 수 있다.

### 7. CI를 Node only acceptance gate로 고정

수정 대상:

- GitHub Actions 또는 기존 CI 설정 파일들

전략:

- Python이 없는 상태에서 `npm install`, `npm run build`, `npm test`, `npm run verify:role1 -- --runtime-provider node-llama-cpp`가 통과하는 job을 추가한다.

커밋 단위:

- `ci(node-only): add pythonless verification gate`

완료 기준:

- 새 PR에서 Python 재유입이 자동으로 막힌다.

예상 충돌:

- Pythonless job을 너무 이르게 강제하면 중간 단계 브랜치가 계속 깨질 수 있다.
- 로컬에서는 통과하지만 CI 머신의 네이티브 backend 차이로 `node-llama-cpp` 또는 `node-pty`가 다르게 실패할 수 있다.
- acceptance gate만 추가하고 문서/설정 정리가 늦으면 실패 원인 해석이 어려워질 수 있다.

## 추천 브랜치와 작업 방식

- 브랜치: `fix/node-only-runtime`
- PR 쪼개기: 1번, 2번, 3번은 분리 PR이 좋다.
- 4번부터 7번은 마지막 정리 PR로 묶는 편이 안전하다.
- 실제 작업 순서: `1 -> 2 -> 3 -> 4+5 -> 6+7`

## 가장 큰 리스크 3개

1. `node-llama-cpp`의 현재 backend가 Gemma4/SuperGemma4를 못 읽으면 1단계가 막힌다.
2. Kompress를 Node로 바꿀 때 품질보다 먼저 placeholder 보존과 safe fallback을 지켜야 한다.
3. `node-pty`는 네이티브 의존이라 macOS와 CI 환경에서 빌드 검증을 초기에 해야 한다.

## 삭제 최종 체크리스트

- `python/` 디렉터리 전체
- `pyproject.toml`
- `.python-version`
- `package.json`의 Python 관련 script
- `src/core/prompt/config.ts`의 Python 전용 키
- `src/core/prompt/kompress-client.ts`의 Python launcher 코드
- `src/integrations/subprocess/runner.ts`의 `buildPythonInvocation()`
- 문서의 Python worker 설명 전부
