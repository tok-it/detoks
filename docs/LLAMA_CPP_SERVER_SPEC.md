# Local LLM Runtime Spec

This document describes the current detoks local LLM runtime contract. The
runtime is `node-llama-cpp`; detoks no longer starts or talks to an external
OpenAI-compatible HTTP server for Role 1 translation.

<!-- 한국어 설명: 이 문서는 현재 detoks 로컬 LLM 런타임 계약을 설명합니다. Role 1 번역은 외부 HTTP 서버가 아니라 `node-llama-cpp` in-process 런타임을 사용합니다. -->

## Runtime Contract

- Runtime provider: `node-llama-cpp`
- Default `LOCAL_LLM_RUNTIME_PROVIDER`: `node-llama-cpp`
- Chat completion path: `src/core/llm-client/client.ts` delegates directly to `completeChatWithNodeLlamaCpp`
- Lifecycle path: `src/core/llm-client/local-runtime.ts` manages only `node-llama-cpp` preload and shutdown
- HTTP chat completion fallback: not supported

## Environment Variables

| Variable | Default | Notes |
| --- | --- | --- |
| `LOCAL_LLM_RUNTIME_PROVIDER` | `node-llama-cpp` | Only `node-llama-cpp` is accepted. |
| `LOCAL_LLM_MODEL_NAME` | `unsloth/Qwen3.5-4B-GGUF` | Logical model name used in metadata and validation. |
| `LOCAL_LLM_MODEL_DIR` | `~/.detoks/models/llm/<repo>` | Model cache directory. |
| `LOCAL_LLM_MODEL_PATH` | unset | Preferred explicit GGUF path. |
| `LOCAL_LLM_HF_REPO` | `unsloth/Qwen3.5-4B-GGUF:Q4_K_M` | Used with `LOCAL_LLM_HF_FILE` when resolving model files. |
| `LOCAL_LLM_HF_FILE` | `Qwen3.5-4B-Q4_K_M.gguf` | GGUF filename. |
| `LOCAL_LLM_CONTEXT_SIZE` | `4096` | Context size passed to the runtime. |
| `LOCAL_LLM_MAX_TOKENS` | `512` | Default completion token budget. |
| `LOCAL_LLM_TOP_K` | `40` | Sampling option. |
| `LOCAL_LLM_TOP_P` | `0.95` | Sampling option. |
| `LOCAL_LLM_REASONING` | `off` | Runtime reasoning mode where supported. |

`LOCAL_LLM_API_BASE`, `LOCAL_LLM_API_KEY`, `LOCAL_LLM_SERVER_HOST`,
`LOCAL_LLM_SERVER_PORT`, and `LOCAL_LLM_SERVER_BINARY` may still be parsed for
legacy config compatibility, but they do not select or start an HTTP runtime.

## Failure Behavior

- `LOCAL_LLM_RUNTIME_PROVIDER=llama-server` fails config validation.
- Missing `LOCAL_LLM_MODEL_NAME` fails before completion.
- Invalid, missing, or unsupported GGUF files fail through the `node-llama-cpp` runtime path.
- If the backend cannot load a GGUF architecture, switch to a `node-llama-cpp` compatible GGUF or update the backend.

## Verification

Use the Role 1 verifier with the node runtime:

```bash
npm run verify:role1 -- --prompt "새 파일을 생성해" --runtime-provider node-llama-cpp
```
