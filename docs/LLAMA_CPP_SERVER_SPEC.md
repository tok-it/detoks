# Llama.cpp Server Spec

This document defines the current detoks runtime contract for the prebuilt `llama-server` binary.

<!-- 한국어 설명: 이 문서는 detoks가 사용하는 prebuilt `llama-server` 바이너리의 현재 런타임 계약을 정의합니다. Python wrapper가 아니라 실제 TypeScript 런처와 llama.cpp 서버 경계를 기준으로 설명합니다. -->

---

## Scope

- OpenAI-compatible chat completions endpoint consumed by TypeScript `src/core/llm-client`
- Health check endpoint used for runtime readiness
- Model listing endpoint used for loaded-model verification
- Environment-based local server auto-start on `127.0.0.1:12370`
- GGUF model loading from a local path or Hugging Face GGUF repository

<!-- 한국어 설명: 이 명세는 TypeScript 클라이언트가 호출하는 채팅 완성 endpoint, readiness 확인용 헬스체크, 모델 식별용 `/v1/models`, 그리고 Role 1 번역용 로컬 llama.cpp 서버 자동 실행을 다룹니다. -->

---

## Non-Goals

- Streaming response handling in detoks
- Public API stability guarantees beyond the current TypeScript boundary
- Multi-model routing
- Batch inference
- Detoks-owned inbound auth for the local auto-started server
- Python proxy or mock runtime modes

<!-- 한국어 설명: detoks는 현재 스트리밍, 멀티 모델 라우팅, 배치 추론, 로컬 auto-start 서버용 인증 계층, 예전 Python proxy/mock 모드를 계약 범위에 포함하지 않습니다. -->

---

## Runtime Location

- TypeScript launcher: `src/core/llm-client/local-runtime.ts`
- TypeScript client boundary: `src/core/llm-client/client.ts`
- External runtime binary: `LOCAL_LLM_SERVER_BINARY`, default `llama-server`
- Manual setup guide: `src/cli/model-setup/LLAMA_SERVER_GUIDE.md`

<!-- 한국어 설명: detoks는 TypeScript 런처가 외부 `llama-server` 바이너리를 직접 실행하고, TypeScript 클라이언트가 OpenAI-compatible HTTP 경계만 사용합니다. -->

---

## Default Configuration

| Key                            | Default                                               | Description                                                     |
| ------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------- |
| `LOCAL_LLM_API_BASE`           | `http://127.0.0.1:12370/v1`                           | TypeScript Role 1 local LLM API base                            |
| `LOCAL_LLM_API_KEY`            | unset                                                 | Optional Bearer token forwarded by the TypeScript client        |
| `LOCAL_LLM_MODEL_NAME`         | `mradermacher/gemma-4-e2b-it-heretic-ara-GGUF:Q4_K_S` | Default model id and alias requested by Role 1 clients          |
| `LOCAL_LLM_AUTO_START`         | `1`                                                   | Auto-start local llama.cpp server for Role 1                    |
| `LOCAL_LLM_SERVER_BINARY`      | `llama-server`                                        | Prebuilt llama.cpp server executable                            |
| `LOCAL_LLM_SERVER_HOST`        | `127.0.0.1`                                           | Auto-start bind host                                            |
| `LOCAL_LLM_SERVER_PORT`        | `12370`                                               | Auto-start bind port                                            |
| `LOCAL_LLM_DEVICE`             | unset                                                 | Optional llama.cpp device selector, e.g. `none`                 |
| `LOCAL_LLM_GPU_LAYERS`         | `all`                                                 | llama.cpp GPU offload layer count                               |
| `LOCAL_LLM_CONTEXT_SIZE`       | `4096`                                                | llama.cpp prompt context size                                   |
| `LOCAL_LLM_TOP_K`              | `40`                                                  | llama.cpp top-k sampling                                        |
| `LOCAL_LLM_TOP_P`              | `0.95`                                                | llama.cpp top-p sampling                                        |
| `LOCAL_LLM_SLEEP_IDLE_SECONDS` | `1200`                                                | Idle seconds before the local model is unloaded                 |
| `LOCAL_LLM_MAX_TOKENS`         | `512`                                                 | Maximum generated tokens per Role 1 translation span            |
| `LOCAL_LLM_REASONING`          | `off`                                                 | llama.cpp reasoning mode for chat templates                     |
| `LOCAL_LLM_HF_REPO`            | `mradermacher/gemma-4-e2b-it-heretic-ara-GGUF:Q4_K_S` | Hugging Face GGUF repo and quant used when no model path exists |
| `LOCAL_LLM_HF_FILE`            | `gemma-4-e2b-it-heretic-ara.Q4_K_S.gguf`              | Exact Hugging Face GGUF file                                    |
| `LOCAL_LLM_MODEL_PATH`         | unset                                                 | Optional local GGUF model path                                  |
| `LOCAL_LLM_MODEL_URL`          | unset                                                 | Optional download URL when model path is missing                |
| `REQUEST_TIMEOUT`              | `30000`                                               | Client-side request timeout in milliseconds                     |

<!-- 한국어 설명: 현재 Role 1 로컬 추론 계약은 `LOCAL_LLM_*` 계열 환경변수와 `REQUEST_TIMEOUT`을 기준으로 동작합니다. 예전 Python wrapper 전용 `LLAMA_SERVER_*`, `LLAMA_CPP_API_BASE`, `LLAMA_SERVER_RESPONSE_TEXT` 계약은 포함하지 않습니다. -->

---

## Execution Modes

### 1. Role 1 Auto-Start Mode

Condition:

- Role 1 translation is requested
- `LOCAL_LLM_AUTO_START` is not disabled
- `fetchImplementation` test override is not provided

Behavior:

- The launcher re-reads `.env` and `.env.local` on each startup, so updated sampling or model values are applied on the next run
- If `LOCAL_LLM_API_BASE` is left at the default local placeholder, derive the runtime base from `LOCAL_LLM_SERVER_HOST` / `LOCAL_LLM_SERVER_PORT` so port changes stay in sync
- If `LOCAL_LLM_MODEL_PATH` exists, start `llama-server -m <path>`
- If `LOCAL_LLM_MODEL_PATH` is missing and `LOCAL_LLM_MODEL_URL` is set, download the GGUF file first
- If no local model path is set, start `llama-server -hf <LOCAL_LLM_HF_REPO> --hf-file <LOCAL_LLM_HF_FILE>`
- Pass `--alias <LOCAL_LLM_MODEL_NAME>` so `/v1/models` can be verified against the expected model id
- Pass `--host`, `--port`, `--ctx-size`, `--top-k`, `--top-p`, `--reasoning`, and `--sleep-idle-seconds` from the current runtime config
- Pass `--gpu-layers <LOCAL_LLM_GPU_LAYERS>`, default `all`, so Metal or GPU offload is requested on supported builds
- If GPU startup fails before readiness, retry once with `--device none --gpu-layers 0`
- Role 1 chat completion requests include `max_tokens`, capped by `LOCAL_LLM_MAX_TOKENS`
- Empty, truncated, or non-GGUF model files fail before `llama-server` launch and are not auto-deleted or re-downloaded

### 2. Existing Local Server Reuse

Condition:

- `LOCAL_LLM_API_BASE` points to localhost
- `GET /health` already returns success

Behavior:

- Reuse the running server when `/v1/models` includes the expected `LOCAL_LLM_MODEL_NAME`
- If the running model does not match, stop the existing server on the configured port and relaunch with the current env values

### 3. Remote or Manually Managed Server Mode

Condition:

- `LOCAL_LLM_API_BASE` points to a non-local host, or local auto-start is disabled

Behavior:

- detoks does not spawn or supervise the server process
- detoks still expects the same OpenAI-compatible `/v1/chat/completions` contract and a usable `/v1/models` response when model verification is needed

<!-- 한국어 설명: Role 1 번역은 기본적으로 prebuilt `llama-server`를 로컬에서 직접 띄우고, 이미 실행 중인 서버가 있으면 `/health`와 `/v1/models`로 재사용 여부를 판단합니다. 원격 서버를 쓰는 경우에는 detoks가 프로세스를 관리하지 않습니다. -->

---

## HTTP Endpoints

### `GET /health`

Purpose:

- Runtime liveness and minimal readiness check

Rules:

- Returns `200 OK` when the server is ready to accept requests
- detoks currently treats any successful `200` response as ready
- Response body shape is not normalized by detoks

### `GET /v1/models`

Purpose:

- Verify that the loaded model matches `LOCAL_LLM_MODEL_NAME`

Accepted response patterns:

- `data[].id`
- `data[].aliases[]`
- `models[].name`
- `models[].model`

Rules:

- detoks treats an empty or unparseable model list as a verification failure
- The expected model name may appear either as the model id or as an alias

### `POST /v1/chat/completions`

Purpose:

- OpenAI-compatible chat completion interface consumed by `src/core/llm-client`

Required request shape:

```json
{
	"model": "mradermacher/gemma-4-e2b-it-heretic-ara-GGUF:Q4_K_S",
	"messages": [
		{
			"role": "user",
			"content": "Translate this text"
		}
	],
	"temperature": 0,
	"max_tokens": 512
}
```

Successful response shape consumed by detoks:

```json
{
	"id": "chatcmpl-...",
	"object": "chat.completion",
	"created": 1710000000,
	"model": "mradermacher/gemma-4-e2b-it-heretic-ara-GGUF:Q4_K_S",
	"choices": [
		{
			"index": 0,
			"message": {
				"role": "assistant",
				"content": "Translated text"
			},
			"finish_reason": "stop"
		}
	]
}
```

<!-- 한국어 설명: detoks는 `/health` 본문을 엄격히 해석하지 않고 readiness만 판단합니다. 대신 `/v1/models`는 모델 식별에 실제로 사용하고, `/v1/chat/completions`는 OpenAI-compatible 응답 구조를 전제로 파싱합니다. -->

---

## Launcher Preflight And Error Contract

The TypeScript launcher performs these checks before or during server startup:

- Missing binary: throw a friendly error when `LOCAL_LLM_SERVER_BINARY` cannot be resolved
- Invalid GGUF file: fail fast when the configured local file is missing, empty, too small, or does not start with the `GGUF` header
- GPU fallback: retry once with CPU-only settings when GPU startup fails before readiness
- Model mismatch: stop and relaunch a localhost server that is running a different model on the configured port
- Request timeout: the client aborts `POST /v1/chat/completions` after `REQUEST_TIMEOUT`

Representative local startup error:

```text
로컬 llama.cpp 서버 바이너리를 찾을 수 없습니다: llama-server. llama-server를 설치하거나 LOCAL_LLM_AUTO_START=0으로 자동 시작을 끄세요.
```

Representative request timeout error:

```text
LLM request timed out after 30000ms
```

<!-- 한국어 설명: 오류 계약의 핵심은 서버 내부 에러 JSON이 아니라, detoks TypeScript 런처와 클라이언트가 어떤 조건에서 fail-fast 하는지입니다. -->

---

## Authentication

- detoks does not provision or enforce inbound auth for the locally auto-started `llama-server`
- If `LOCAL_LLM_API_KEY` is set, the TypeScript client forwards `Authorization: Bearer <LOCAL_LLM_API_KEY>` to `POST /v1/chat/completions`
- The local auto-start contract assumes no extra auth is required for `/health` and `/v1/models`

<!-- 한국어 설명: 현재 detoks는 로컬 auto-start 서버 앞에 별도 인증 계층을 두지 않습니다. 필요한 경우 요청 헤더 전달만 지원하고, 서버 쪽 인증 설정은 외부에서 맞춰야 합니다. -->

---

## Compatibility Contract With TypeScript

The current TypeScript client assumes:

- Base URL already includes `/v1`
- Request path is `chat/completions`
- Response contains `choices[0].message.content`
- `message.content` may be either a string or an array of `{ text: string }`
- `GET /health` returns `200 OK` when the server is usable
- `GET /v1/models` exposes the loaded model id or alias

This means the prebuilt `llama-server` process must preserve OpenAI-compatible response semantics at this boundary.

<!-- 한국어 설명: TypeScript는 `choices[0].message.content`와 `/v1/models` 결과를 직접 해석하므로, prebuilt `llama-server`는 이 경계의 호환성을 깨면 안 됩니다. -->

---

## Explicitly Undefined

The following are intentionally not specified yet:

- streaming chunk format
- token counting accuracy
- prompt truncation policy
- context window policy beyond `LOCAL_LLM_CONTEXT_SIZE`
- concurrency limits
- remote server auth negotiation beyond a forwarded bearer token
- proxy or mock modes from the removed Python wrapper
- automatic GGUF file discovery rules beyond explicit path, URL, or Hugging Face repo

<!-- 한국어 설명: 위 항목들은 아직 팀 차원의 고정 계약이 아니므로, 필요해지면 별도 명세로 추가해야 합니다. -->
