# Llama.cpp Server Spec

This document defines the current `python/llama-server` runtime contract used by detoks.

<!-- 한국어 설명: 이 문서는 detoks에서 사용하는 현재 `python/llama-server` 런타임 계약을 정의합니다. 구현된 범위만 명시하며, 아직 없는 기능은 포함하지 않습니다. -->

---

## Scope

- OpenAI-compatible chat completions endpoint for TypeScript `src/core/llm-client`
- Health check endpoint for runtime readiness
- Environment-based runtime configuration
- Optional upstream proxy mode for an external llama.cpp-compatible server
- Role 1 local llama.cpp server auto-start on `127.0.0.1:12370`
- GGUF model loading from a local path or Hugging Face GGUF repository

<!-- 한국어 설명: 이 명세는 TypeScript 클라이언트가 호출하는 채팅 완성 endpoint, 헬스체크, 환경변수 설정, 외부 llama.cpp 서버 프록시 모드, 그리고 Role 1 번역용 로컬 llama.cpp 서버 자동 실행을 다룹니다. -->

---

## Non-Goals

- Streaming responses
- Public API stability guarantees
- WebSocket support
- Multi-model routing
- Batch inference
- Model download lifecycle management

<!-- 한국어 설명: 스트리밍, 공개 API 안정성 보장, WebSocket, 멀티 모델 라우팅, 배치 추론, 모델 다운로드 관리 같은 항목은 현재 범위에 없습니다. -->

---

## Runtime Location

- Server entrypoint: `python/llama-server/run.py`
- Importable package: `python/llama_server`
- TypeScript client boundary: `src/core/llm-client/client.ts`

<!-- 한국어 설명: 실행 엔트리포인트는 하이픈 경로를 유지하고, Python import는 언더스코어 패키지를 사용합니다. TypeScript는 `src/core/llm-client`만 통해 이 서버와 통신합니다. -->

---

## Default Configuration

| Key                          | Default                                        | Description                                          |
| ---------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| `LLAMA_SERVER_HOST`          | `127.0.0.1`                                    | Bind host                                            |
| `LLAMA_SERVER_PORT`          | `12370`                                        | Bind port                                            |
| `LLAMA_SERVER_API_PREFIX`    | `/v1`                                          | API prefix                                           |
| `LLAMA_SERVER_HEALTH_PATH`   | `/health`                                      | Health endpoint path                                 |
| `LOCAL_LLM_MODEL_NAME`       | `mradermacher/gemma-4-E2B-it-heretic-ara-GGUF` | Default model name returned to clients               |
| `REQUEST_TIMEOUT`            | `30`                                           | Upstream timeout in seconds                          |
| `LLAMA_SERVER_API_KEY`       | unset                                          | Optional Bearer auth for inbound requests            |
| `LLAMA_CPP_API_BASE`         | unset                                          | Upstream OpenAI-compatible llama.cpp base URL        |
| `LLAMA_CPP_API_KEY`          | unset                                          | Optional Bearer auth for upstream requests           |
| `LLAMA_SERVER_RESPONSE_TEXT` | unset                                          | Mock response text for local/serverless verification |
| `LOCAL_LLM_API_BASE`         | `http://127.0.0.1:12370/v1`                   | TypeScript Role 1 local LLM API base                 |
| `LOCAL_LLM_AUTO_START`       | `1`                                            | Auto-start local llama.cpp server for Role 1         |
| `LOCAL_LLM_SERVER_BINARY`    | `llama-server`                                 | llama.cpp server executable                          |
| `LOCAL_LLM_SERVER_HOST`      | `127.0.0.1`                                    | Auto-start bind host                                 |
| `LOCAL_LLM_SERVER_PORT`      | `12370`                                        | Auto-start bind port                                 |
| `LOCAL_LLM_HF_REPO`          | `mradermacher/gemma-4-E2B-it-heretic-ara-GGUF` | Hugging Face GGUF repo used when no model path exists |
| `LOCAL_LLM_MODEL_PATH`       | unset                                          | Optional local GGUF model path                       |
| `LOCAL_LLM_MODEL_URL`        | unset                                          | Optional download URL when model path is missing     |

<!-- 한국어 설명: 기본 모델명은 현재 로컬 서버 기본값입니다. Python 서버는 upstream 프록시 또는 mock 응답 모드로 동작하고, TypeScript Role 1 경로는 필요 시 llama.cpp `llama-server`를 로컬에서 자동 실행합니다. -->

---

## Execution Modes

### 1. Proxy Mode

Condition:

- `LLAMA_CPP_API_BASE` is set

Behavior:

- Incoming `POST /v1/chat/completions` request is forwarded to `{LLAMA_CPP_API_BASE}/chat/completions`
- Request body is passed through in OpenAI-compatible shape
- Upstream JSON is preserved as `raw_response`

### 2. Mock Mode

Condition:

- `LLAMA_SERVER_RESPONSE_TEXT` is set

Behavior:

- Server returns a fixed assistant message without contacting an upstream server
- Intended for contract tests and local verification only

### 3. Invalid Runtime State

Condition:

- Neither `LLAMA_CPP_API_BASE` nor `LLAMA_SERVER_RESPONSE_TEXT` is set

Behavior:

- Chat completion requests fail with `503 Service Unavailable`

<!-- 한국어 설명: 현재 서버는 자체 llama.cpp 프로세스를 직접 관리하지 않고, upstream 프록시 또는 mock 응답 두 모드만 지원합니다. -->

### 4. Role 1 Auto-Start Mode

Condition:

- Role 1 translation is requested
- `LOCAL_LLM_AUTO_START` is not disabled
- `fetchImplementation` test override is not provided

Behavior:

- If `LOCAL_LLM_API_BASE` health check is already ready, reuse the running server
- If `LOCAL_LLM_MODEL_PATH` exists, start `llama-server -m <path>`
- If `LOCAL_LLM_MODEL_PATH` is missing and `LOCAL_LLM_MODEL_URL` is set, download the GGUF file first
- If no local model path is set, start `llama-server -hf <LOCAL_LLM_HF_REPO>` and let llama.cpp handle Hugging Face GGUF download/cache
- The server is opened on `LOCAL_LLM_SERVER_HOST:LOCAL_LLM_SERVER_PORT`, default `127.0.0.1:12370`

<!-- 한국어 설명: Role 1 번역은 기본적으로 12370 포트의 로컬 llama.cpp 서버를 준비한 뒤 OpenAI-compatible `/v1/chat/completions`를 호출합니다. -->

---

## HTTP Endpoints

### `GET /health`

Purpose:

- Runtime liveness and minimal readiness check

Response:

```json
{
	"ok": true,
	"model": "mradermacher/gemma-4-E2B-it-heretic-ara-GGUF",
	"backend": "configured"
}
```

Rules:

- Returns `200 OK`
- `ok` is `true` when either proxy mode or mock mode is configured
- `ok` is `false` when no inference backend is configured

### `POST /v1/chat/completions`

Purpose:

- OpenAI-compatible chat completion interface consumed by `src/core/llm-client`

Required request shape:

```json
{
	"model": "mradermacher/gemma-4-E2B-it-heretic-ara-GGUF",
	"messages": [
		{
			"role": "user",
			"content": "Translate this text"
		}
	],
	"temperature": 0
}
```

Current validation rules:

- `model`: non-empty string
- `messages`: non-empty array
- `message.role`: `system` | `user` | `assistant`
- `message.content`: string
- `temperature`: number greater than or equal to `0`
- Unknown top-level fields are rejected

Successful response shape:

```json
{
	"id": "chatcmpl-...",
	"object": "chat.completion",
	"created": 1710000000,
	"model": "mradermacher/gemma-4-E2B-it-heretic-ara-GGUF",
	"choices": [
		{
			"index": 0,
			"message": {
				"role": "assistant",
				"content": "Translated text"
			},
			"finish_reason": "stop"
		}
	],
	"usage": {
		"prompt_tokens": 0,
		"completion_tokens": 0,
		"total_tokens": 0
	},
	"raw_response": {
		"choices": [
			{
				"message": {
					"content": "Translated text"
				}
			}
		]
	}
}
```

<!-- 한국어 설명: 성공 응답은 OpenAI chat completion 형식을 따르며, upstream 응답이 있으면 `raw_response`에 그대로 유지합니다. -->

---

## Authentication

Inbound request auth:

- Disabled by default
- Enabled only when `LLAMA_SERVER_API_KEY` is set
- Requires `Authorization: Bearer <LLAMA_SERVER_API_KEY>`

Upstream request auth:

- Disabled by default
- Enabled only when `LLAMA_CPP_API_KEY` is set
- Sends `Authorization: Bearer <LLAMA_CPP_API_KEY>` to upstream

Auth failure response:

```json
{
	"error": {
		"message": "Unauthorized"
	}
}
```

<!-- 한국어 설명: 현재 인증은 단순 Bearer 토큰 비교만 수행하며, role/tenant/session 개념은 없습니다. -->

---

## Error Contract

### Invalid JSON

Status:

- `400 Bad Request`

Body:

```json
{
	"error": {
		"message": "Invalid JSON body"
	}
}
```

### Invalid Request Schema

Status:

- `400 Bad Request`

Body:

```json
{
	"error": {
		"message": "Invalid chat completions request",
		"details": []
	}
}
```

### Missing Backend Configuration or Upstream Failure

Status:

- `503 Service Unavailable`

Body:

```json
{
	"error": {
		"message": "No inference backend configured. Set LLAMA_CPP_API_BASE or LLAMA_SERVER_RESPONSE_TEXT."
	}
}
```

### Unknown Path

Status:

- `404 Not Found`

Body:

```json
{
	"error": {
		"message": "Not found"
	}
}
```

---

## Compatibility Contract With TypeScript

The current TypeScript client assumes:

- Base URL already includes `/v1`
- Request path is `chat/completions`
- Response contains `choices[0].message.content`
- `message.content` may be either a string or an array of `{ text: string }`

This means the Python server must preserve OpenAI-compatible response semantics at this boundary.

<!-- 한국어 설명: TypeScript는 `choices[0].message.content`를 직접 파싱하므로, Python 서버는 이 응답 구조를 깨면 안 됩니다. -->

---

## Explicitly Undefined

The following are intentionally not specified yet:

- streaming chunk format
- token counting accuracy
- prompt truncation policy
- context window policy
- concurrency limits
- retry policy inside the Python server
- advanced local llama.cpp process supervision
- automatic GGUF file discovery rules beyond explicit path, URL, or Hugging Face repo

<!-- 한국어 설명: 위 항목들은 아직 팀 차원의 계약이 없으므로, 이후 필요할 때 별도 명세로 고정해야 합니다. -->
