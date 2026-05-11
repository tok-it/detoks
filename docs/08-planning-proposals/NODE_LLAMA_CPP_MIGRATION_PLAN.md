# node-llama-cpp 전환 설계안

> 상태 메모
>
> 이 문서는 초기 설계 검토 기록이다.
> 현재 detoks 구현은 여기서 한때 권장했던 `Node sidecar + HTTP 유지`가 아니라,
> `src/core/llm-client/node-llama-runtime.ts`를 통한 **in-process 직접 호출**로 정리됐다.
> 아래의 sidecar 관련 내용은 폐기된 대안 또는 검토 이력으로 읽어야 한다.

## 목적

detoks의 Role 1 로컬 추론 경로를 외부 prebuilt `llama-server` 바이너리 기반에서 `node-llama-cpp` 기반으로 전환한다.

이번 설계의 목표는 다음 3가지를 동시에 만족하는 것이다.

1. Python 없이 Node만으로 로컬 추론 경계를 운영한다.
2. detoks 내부의 기존 OpenAI-compatible HTTP 계약을 최대한 유지한다.
3. 구현 변경 범위를 최소화하면서도 운영 리스크를 낮춘다.

---

## 현재 기준점

현재 detoks는 다음 경계를 전제로 동작한다.

- Role 1 호출자는 `src/core/llm-client/client.ts`에서 `POST /v1/chat/completions`만 사용한다.
- 런타임 런처는 `src/core/llm-client/local-runtime.ts`에서 `/health`, `/v1/models`, 모델 불일치 재기동, GPU 실패 시 CPU 재시도를 담당한다.
- 설정의 source of truth는 `.env` / `.env.local`의 `LOCAL_LLM_*` 키다.
- CLI 모델 선택기는 GGUF 파일 경로와 Hugging Face repo/file 정보를 `.env`에 저장한다.

즉, detoks의 실제 결합점은 "`llama.cpp`를 쓴다"가 아니라 아래 3개다.

1. `GET /health`
2. `GET /v1/models`
3. `POST /v1/chat/completions`

이 3개를 유지하면 상위 파이프라인 수정량을 크게 줄일 수 있다.

---

## 비목표

이번 전환의 비목표는 다음과 같다.

- 스트리밍 API 도입
- OpenAI 전체 API surface 구현
- 멀티 모델 동시 라우팅
- 배치 추론 최적화 1차 완성
- Kompress 대체
- Role 1 번역 프롬프트 자체 개편

이번 전환은 `chat/completions` 호환성과 안정적인 런타임 교체에 집중한다.

---

## 선택지 비교

### 안 1. in-process 직접 호출

`src/core/translate/translate.ts` 또는 `src/core/llm-client/client.ts`에서 `node-llama-cpp`를 직접 호출하고 HTTP를 제거한다.

장점:

- 네트워크 홉이 사라진다.
- 내부 타입 모델링이 단순해질 수 있다.

단점:

- `client.ts`, `local-runtime.ts`, 테스트, 문서, CLI 안내를 함께 크게 바꿔야 한다.
- 네이티브 바인딩 실패나 메모리 이슈가 main Node 프로세스에 직접 영향을 준다.
- 현재 `/health`, `/v1/models` 전제 테스트 자산을 재활용하기 어렵다.

판단:

- 최소 수정 원칙에 맞지 않는다.
- 1차 전환안으로는 부적합하다.

### 안 2. Node sidecar + HTTP 유지

`node-llama-cpp`를 사용하는 별도 Node sidecar 프로세스를 띄우고, detoks는 지금처럼 HTTP로 붙는다.

장점:

- `src/core/llm-client/client.ts`를 거의 그대로 유지할 수 있다.
- `local-runtime.ts`의 런처/헬스체크/모델 검증 구조를 재사용할 수 있다.
- 프로세스 격리를 유지할 수 있다.
- 기존 `verify-role1`, CLI smoke, runtime test 자산을 살리기 쉽다.

단점:

- `/health`, `/v1/models`, `/v1/chat/completions`를 직접 구현해야 한다.
- `node-llama-cpp`의 chat wrapper 동작 차이에 따른 출력 drift 검증이 필요하다.

판단:

- 최소 수정과 리스크 제어를 함께 만족하는 권장안이다.

### 안 3. 완전 교체 단일 롤아웃

기존 `llama-server` 경로를 한 번에 제거하고 `node-llama-cpp`만 남긴다.

판단:

- 최종 상태로는 가능하지만, 1차 도입 방식으로는 위험하다.
- parity 검증 전에는 권장하지 않는다.

---

## 권장 아키텍처

### 핵심 원칙

- 상위 Role 1 파이프라인은 HTTP 계약을 유지한다.
- `node-llama-cpp`는 detoks 메인 프로세스가 아니라 sidecar 프로세스에서 실행한다.
- 1차 구현은 단일 모델, 단일 런타임, 단일 요청 큐를 기본값으로 둔다.

### 권장 구조

```text
Role 1 pipeline
  -> src/core/llm-client/client.ts
  -> http://127.0.0.1:12370/v1/chat/completions
  -> Node sidecar server
  -> node-llama-cpp
  -> GGUF model
```

### 신규 구성요소

- `src/core/llm-client/node-llama-sidecar.ts`
  - HTTP 서버 진입점
  - `/health`, `/v1/models`, `/v1/chat/completions` 제공
- `src/core/llm-client/node-llama-runtime.ts`
  - `getLlama()` 싱글턴
  - 모델 로드/재로드
  - context/session 수명 관리
  - 요청 직렬화

### 기존 구성요소의 역할 유지

- `src/core/llm-client/client.ts`
  - 요청/응답 HTTP 경계 유지
- `src/core/llm-client/local-runtime.ts`
  - sidecar 프로세스 기동, readiness 확인, 종료 관리
- `src/core/prompt/config.ts`
  - `.env` 기반 설정 로더 유지

---

## 최소 변경 설계

### 유지할 것

- `LOCAL_LLM_API_BASE`
- `LOCAL_LLM_MODEL_NAME`
- `LOCAL_LLM_MODEL_PATH`
- `LOCAL_LLM_HF_REPO`
- `LOCAL_LLM_HF_FILE`
- `complete_chat()`의 요청/응답 파싱 계약
- `/health`, `/v1/models`, `/v1/chat/completions` 중심 테스트 자산

### 새로 추가할 것

- `LOCAL_LLM_RUNTIME_PROVIDER=node-llama-cpp | llama-server`

이 키를 추가하는 이유는 2가지다.

1. 도입 초기에는 기존 `llama-server`와 병행 검증이 가능해야 한다.
2. `LOCAL_LLM_SERVER_BINARY` 하나에 너무 많은 의미를 싣지 않아야 한다.

### 바꾸지 않을 것

- `LOCAL_LLM_API_BASE` 기본값 `http://127.0.0.1:12370/v1`
- 상위 Role 1 prompt compile 흐름
- batch verifier 출력 계약
- CLI 모델 선택기의 `.env` 저장 포맷

---

## HTTP 계약 설계

### `GET /health`

용도:

- 런타임 readiness 확인

정책:

- 모델 로드 완료 전에는 `503`
- 요청 처리 가능 상태에서는 `200`
- 바디는 최소 JSON만 반환

예시:

```json
{
  "ok": true,
  "provider": "node-llama-cpp",
  "model": "mradermacher/supergemma4-e4b-abliterated-GGUF"
}
```

### `GET /v1/models`

용도:

- `local-runtime.ts`의 기대 모델 검증

정책:

- `data[0].id`에 현재 `LOCAL_LLM_MODEL_NAME`
- `data[0].aliases`에도 동일 값 또는 별칭 포함

예시:

```json
{
  "data": [
    {
      "id": "mradermacher/supergemma4-e4b-abliterated-GGUF",
      "aliases": [
        "mradermacher/supergemma4-e4b-abliterated-GGUF"
      ]
    }
  ]
}
```

### `POST /v1/chat/completions`

1차 구현 범위:

- `model`
- `messages`
- `temperature`
- `max_tokens`

정책:

- `messages`를 OpenAI 형식 그대로 받되, 내부에서는 `system` + `user` + `assistant` history를 `LlamaChatSession` 입력으로 변환한다.
- 응답은 반드시 `choices[0].message.content`를 채운다.
- 스트리밍은 지원하지 않는다.
- `n`, `tools`, `response_format` 등은 1차에서 미지원으로 둔다.

예시 응답:

```json
{
  "id": "chatcmpl-detoks-local-0001",
  "object": "chat.completion",
  "created": 1710000000,
  "model": "mradermacher/supergemma4-e4b-abliterated-GGUF",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Create a new file"
      },
      "finish_reason": "stop"
    }
  ]
}
```

---

## node-llama-cpp 내부 설계

### 런타임 싱글턴

원칙:

- `getLlama()`는 프로세스당 1회만 생성
- 현재 모델도 1개만 유지
- 모델 변경 시 기존 model/context/session을 `dispose()` 후 재생성

이유:

- 공식 문서상 `getLlama()`는 인스턴스마다 자체 자원을 잡으므로 재사용이 권장된다.
- 모델/컨텍스트도 명시적으로 `dispose()`하는 것이 메모리 회수에 유리하다.

### 모델 로드 전략

우선순위:

1. `LOCAL_LLM_MODEL_PATH`
2. `LOCAL_LLM_HF_REPO` + `LOCAL_LLM_HF_FILE`

권장 방식:

- `LOCAL_LLM_MODEL_PATH`가 있으면 그 파일을 직접 사용
- 경로가 없으면 `resolveModelFile()`로 Hugging Face URI를 해석해 로컬 캐시 경로를 확보
- 요청 시 다운로드하지 말고 런타임 startup 단계에서만 모델 해석/다운로드 수행

### 컨텍스트/세션 전략

1차 구현:

- `context` 1개
- `sequence` 1개
- 요청 직렬화 큐 1개
- 요청마다 새 `LlamaChatSession` 생성

이유:

- detoks의 Role 1 batch는 현재 순차 처리라 과한 병렬성이 필요 없다.
- 같은 sequence를 동시에 여러 요청이 공유하면 예측 불가능한 결과가 날 수 있다.
- 안정성 확보 후 `sequences > 1`로 확장 가능하다.

### 샘플링 옵션 매핑

권장 매핑:

- `LOCAL_LLM_TOP_K` -> `topK`
- `LOCAL_LLM_TOP_P` -> `topP`
- `TEMPERATURE` -> `temperature`
- `LOCAL_LLM_MAX_TOKENS` -> `maxTokens`

주의:

- `LOCAL_LLM_REASONING`
- `LOCAL_LLM_SLEEP_IDLE_SECONDS`

이 두 항목은 `llama-server`와 동일한 의미로 1:1 대응되지 않을 수 있으므로 1차에서 보수적으로 다뤄야 한다.

권장 정책:

- `LOCAL_LLM_REASONING`은 1차에서 no-op 또는 제한적 매핑으로 둔다.
- idle unload는 HTTP 서버 레벨 타이머로 구현한다.

---

## 런타임 관리 설계

### `local-runtime.ts` 변경 원칙

- 현재 public 함수 이름은 유지한다.
- provider가 `llama-server`면 기존 경로를 그대로 탄다.
- provider가 `node-llama-cpp`면 Node sidecar를 spawn한다.

### sidecar 기동 방식

권장:

```text
node dist/src/core/llm-client/node-llama-sidecar.js
```

또는 개발 모드에서는:

```text
tsx src/core/llm-client/node-llama-sidecar.ts
```

운영용 패키징을 생각하면 최종적으로는 build 산출물을 실행하는 쪽이 안전하다.

### 모델 불일치 처리

유지:

- 기존처럼 `/v1/models` 확인
- 기대 모델과 다르면 기존 sidecar 종료 후 재기동

### 종료 처리

유지:

- `shutdownManagedLocalLlmRuntime()`는 계속 제공
- 단, 종료 대상이 `llama-server`인지 sidecar인지 provider별로 분기

---

## 리스크 평가

### P0

- chat wrapper 불일치로 번역 출력이 달라질 수 있다.
- 같은 GGUF라도 `llama-server`와 `node-llama-cpp`의 stop behavior 차이가 있을 수 있다.

대응:

- `verify-role1` parity 비교를 필수 게이트로 둔다.

### P1

- prebuilt binary를 못 쓰면 source build fallback이 일어날 수 있다.

대응:

- 1차 PoC에서는 `build: "never"` 또는 이에 준하는 보수 설정 검토
- 설치 실패를 빠르게 surface

### P1

- sidecar 안에서 모델 로드/컨텍스트 누수가 날 수 있다.

대응:

- 모델 전환, 종료, 오류 시 `dispose()` 경로를 모두 테스트

### P2

- 동시 요청이 생기면 sequence 경쟁이 날 수 있다.

대응:

- 1차는 단일 요청 큐
- 필요 시 다중 sequence는 2차에서만 도입

---

## 단계별 롤아웃

### Phase 0. Node-only 기준 고정

- 최종 목표를 "완전 Node only"로 명시
- Role 1 추론, prompt compression, PTY transcript, 문서/CI까지 포함한 제거 범위 확정
- `LOCAL_LLM_RUNTIME_PROVIDER`와 남겨둘 env 표면 확정

예상 충돌:

- 현재 문서 상단의 sidecar 검토 기록과 새 Node-only 목표가 함께 존재해 독자가 현재 권장안을 오해할 수 있다.
- `LOCAL_LLM_API_BASE`, `LOCAL_LLM_RUNTIME_PROVIDER`, `LOCAL_LLM_SERVER_BINARY` 중 어떤 키를 최종적으로 남길지 합의가 늦어질 수 있다.
- Role 1만 Node로 바꾸는 것과 저장소 전체 Python 제거를 같은 단계로 볼지에 따라 범위 해석이 달라질 수 있다.

### Phase 1. Role 1 in-process 런타임 안정화

- `node-llama-cpp` in-process 경로를 Role 1 기본 후보로 고정
- `verify-role1` 기준으로 실제 번역 성공까지 확보
- `llama-server`는 fallback/provider 비교 용도로만 한시 유지

예상 충돌:

- 현재 설치된 `node-llama-cpp` backend가 Gemma4/SuperGemma4 GGUF를 직접 못 읽으면 이 단계가 시작점에서 막힐 수 있다.
- `llama-server`와 `node-llama-cpp`의 chat wrapper, stop token, sampling 차이로 결과 parity가 기대보다 크게 흔들릴 수 있다.
- in-process 특성상 모델 로드 실패나 메모리 문제의 영향 범위가 메인 Node 프로세스로 직접 번질 수 있다.

### Phase 2. Kompress를 Node 구현으로 치환

- Python Kompress worker를 제거하고 Node 기반 compression 구현으로 교체
- 기존 `compression_provider: "kompress"` 계약은 유지
- placeholder 보존과 unsafe fallback 규칙은 그대로 유지

예상 충돌:

- Python `kompress-base`와 동일한 압축 품질을 Node에서 즉시 재현하지 못할 수 있다.
- 압축 품질보다 placeholder 보존이 우선이므로, 지나친 품질 추구가 guardrail 회귀로 이어질 수 있다.
- `kompress-client.ts`, `compression.ts`, config/test fixture가 동시에 움직이면서 범위가 생각보다 커질 수 있다.

### Phase 3. PTY transcript를 Node 구현으로 치환

- `runner.ts`의 Python `pty.spawn` fallback 제거
- `node-pty` 또는 동등한 Node-native 경로로 transcript 실행 통일
- real adapter transcript 테스트 유지

예상 충돌:

- `node-pty`는 네이티브 의존성이 있어 macOS 로컬과 CI 환경 모두에서 빌드/설치 이슈가 날 수 있다.
- 현재 Python fallback이 흡수하던 입력/출력 edge case가 Node PTY 구현에서 다르게 드러날 수 있다.
- transcript 이벤트 타이밍이 바뀌면 TUI, real adapter, CLI smoke 테스트가 연쇄적으로 흔들릴 수 있다.

### Phase 4. Python 전용 설정 표면 제거

- `KOMPRESS_PYTHON_BIN`, `KOMPRESS_STARTUP_TIMEOUT` 등 Python 전용 env와 config 필드 제거
- `package.json`의 Python 관련 helper script 제거
- 테스트 fixture와 CLI 도움말을 Node-only 기준으로 정리

예상 충돌:

- 설정 키를 먼저 지우면 아직 남아 있는 Python 경로가 조용히 깨질 수 있다.
- `.env` 예시, 테스트 fixture, 문서의 env 표기가 서로 다른 시점으로 어긋날 수 있다.
- 사용자가 이미 쓰는 로컬 `.env`가 오래된 키를 계속 갖고 있어 혼선이 생길 수 있다.

### Phase 5. Python 런타임 자산 삭제

- `python/llama_server`, `pyproject.toml`, `.python-version` 제거
- Python 전제 보조 스크립트를 Node/tsx로 이관
- 저장소 루트에서 Python 설치가 없어도 빌드/테스트 가능하게 정리

예상 충돌:

- `scripts/todo-compare/*` 같은 보조 스크립트가 메인 런타임보다 늦게 정리되면 "아직 Python 필요" 상태가 남을 수 있다.
- 문서나 CI보다 파일 삭제가 먼저 들어가면 repo가 일시적으로 자기 설명과 맞지 않게 된다.
- 삭제 범위가 커서 한 PR에 몰리면 코드 리뷰와 롤백이 어려워질 수 있다.

### Phase 6. 문서와 CI를 Node-only 기준으로 마감

- 프로젝트 구조, 버전 매트릭스, 의존성 워크플로, CLI/스펙 문서 재작성
- CI에 "Python 없이도 전체 동작" 검증 게이트 추가
- stale wording과 오래된 운영 가이드 제거

예상 충돌:

- 문서 일부가 여전히 sidecar 또는 Python worker를 전제로 설명하면 실제 구현보다 오래된 경계가 더 강하게 보일 수 있다.
- CI에서 Pythonless job을 너무 이르게 강제하면 중간 단계 브랜치가 계속 깨질 수 있다.
- 런타임은 Node-only가 되었어도 실험성 문서나 예시 명령에 Python이 남아 있으면 최종 인상에 혼선을 줄 수 있다.

---

## 구현 파일 계획

### 신규 파일

- `src/core/llm-client/node-llama-runtime.ts`
- 필요 시 Node 기반 compression/runtime 보조 모듈
- 필요 시 Node PTY 보조 모듈

### 수정 파일

- `src/core/llm-client/client.ts`
- `src/core/prompt/config.ts`
- `src/core/llm-client/local-runtime.ts`
- `src/core/translate/translate.ts`
- `src/core/prompt/compression.ts`
- `src/core/prompt/kompress-client.ts`
- `src/integrations/subprocess/runner.ts`
- `docs/LLAMA_CPP_SERVER_SPEC.md`
- `src/cli/model-setup/LLAMA_SERVER_GUIDE.md`
- 관련 unit/integration 테스트

### 삭제 후보

- `python/llama_server/*`
- `pyproject.toml`
- `.python-version`
- `package.json`의 Python helper script

### 최대한 유지할 파일

- `src/core/translate/*` 번역 핵심 로직
- `src/core/pipeline/*` 상위 파이프라인 구조
- 상위 CLI 명령 계약과 verifier 출력 포맷

---

## 검증 게이트

다음 항목을 모두 통과해야 전환을 진행한다.

1. `npm run verify:role1 -- --prompt ... --runtime-provider node-llama-cpp` 단건 성공
2. `verify-role1 --file ... --limit N`에서 기존 `llama-server` 대비 결과 품질 비교 가능
3. compression 경로에서 Python worker spawn이 0회
4. PTY transcript 경로에서 Python fallback이 0회
5. `npm run build`와 `npm test`가 Python 없는 환경에서도 통과
6. `rg -n "python3|python|pyproject|kompress_worker|llama_server" src scripts tests docs package.json README*` 결과가 허용 목록으로 수렴
7. 실패 시 현재 backend/모델 호환성 문제를 친절한 오류 메시지로 표면화

---

## 최종 권고

`node-llama-cpp` 전환은 가능하다.

최종 목표가 "완전 Node only"라면, 이제 권장 경로도 그 목표에 맞춰 바뀌어야 한다.

단, 한 번에 Python을 다 제거하지 말고 아래 순서로 끊어 가는 것이 안전하다.

즉, 권장 결정은 다음과 같다.

- 최종 목표: Node only
- 1차 구현 형태: Role 1 in-process `node-llama-cpp` 안정화
- 2차 구현 형태: Kompress/PTY Python 경계 제거
- 최종 마감: Python 자산 삭제 -> 문서/CI Node-only 고정
