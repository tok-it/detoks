from __future__ import annotations

from typing import cast

from llama_server.backend import BackendCompletionResult, InferenceBackend
from llama_server.config import load_llama_server_config
from llama_server.server import build_chat_completions_response, build_health_response


class StubBackend:
    name = "stub"

    def complete_chat(self, request_data, config) -> BackendCompletionResult:
        return BackendCompletionResult(
            content=f"translated:{request_data.messages[-1].content}",
            raw_response={"source": "stub"},
        )


def test_load_llama_server_config_defaults() -> None:
    config = load_llama_server_config({})

    assert config.host == "127.0.0.1"
    assert config.port == 12370
    assert config.api_prefix == "/v1"
    assert config.health_path == "/health"
    assert config.model_name == "mradermacher/supergemma4-e4b-abliterated-GGUF:Q4_K_S"


def test_load_llama_server_config_reads_local_llm_model_name() -> None:
    config = load_llama_server_config({"LOCAL_LLM_MODEL_NAME": "detoks-local"})

    assert config.model_name == "detoks-local"


def test_build_health_response_reports_backend_state() -> None:
    config = load_llama_server_config({"LLAMA_SERVER_RESPONSE_TEXT": "ok"})

    response = build_health_response(config, cast(InferenceBackend, StubBackend()))

    assert response.status_code == 200
    assert response.body == {
        "ok": True,
        "model": "mradermacher/supergemma4-e4b-abliterated-GGUF:Q4_K_S",
        "backend": "stub",
    }


def test_build_chat_completions_response_returns_openai_shape() -> None:
    config = load_llama_server_config({"LLAMA_SERVER_RESPONSE_TEXT": "unused"})

    response = build_chat_completions_response(
        raw_body=(
            b'{"model":"local-model","messages":[{"role":"user","content":"\xed\x8c\x8c\xec\x9d\xbc \xec\x83\x9d\xec\x84\xb1"}],"temperature":0}'
        ),
        headers={},
        config=config,
        backend=cast(InferenceBackend, StubBackend()),
    )

    assert response.status_code == 200
    assert response.body["object"] == "chat.completion"
    assert response.body["model"] == "local-model"
    assert response.body["choices"][0]["message"]["content"] == "translated:파일 생성"
    assert response.body["raw_response"] == {"source": "stub"}


def test_build_chat_completions_response_rejects_bad_api_key() -> None:
    config = load_llama_server_config({"LLAMA_SERVER_API_KEY": "secret"})

    response = build_chat_completions_response(
        raw_body=b'{"model":"local-model","messages":[{"role":"user","content":"hello"}],"temperature":0}',
        headers={},
        config=config,
        backend=cast(InferenceBackend, StubBackend()),
    )

    assert response.status_code == 401
    assert response.body["error"]["message"] == "Unauthorized"
