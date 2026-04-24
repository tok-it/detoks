from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Protocol
from urllib import error, request

from .config import LlamaServerConfig
from .schemas import ChatCompletionsRequest


@dataclass(frozen=True)
class BackendCompletionResult:
    content: str
    raw_response: dict[str, Any] | None = None


class InferenceBackend(Protocol):
    name: str

    def complete_chat(
        self,
        request_data: ChatCompletionsRequest,
        config: LlamaServerConfig,
    ) -> BackendCompletionResult: ...


def extract_content(payload: dict[str, Any]) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ValueError("Invalid upstream response: missing choices[0]")

    first_choice = choices[0]
    if not isinstance(first_choice, dict):
        raise ValueError("Invalid upstream response: choices[0] must be an object")

    message = first_choice.get("message")
    if not isinstance(message, dict):
        raise ValueError("Invalid upstream response: missing message")

    content = message.get("content")
    if isinstance(content, str):
        return content

    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
        return "".join(parts)

    raise ValueError("Invalid upstream response: unsupported content shape")


class ProxyLlamaCppBackend:
    name = "proxy"

    def complete_chat(
        self,
        request_data: ChatCompletionsRequest,
        config: LlamaServerConfig,
    ) -> BackendCompletionResult:
        if not config.upstream_api_base:
            raise RuntimeError("LLAMA_CPP_API_BASE is required for proxy inference")

        base = config.upstream_api_base.rstrip("/")
        target_url = f"{base}/chat/completions"
        body = json.dumps(request_data.model_dump()).encode("utf-8")
        headers = {"content-type": "application/json"}
        if config.upstream_api_key:
            headers["authorization"] = f"Bearer {config.upstream_api_key}"

        upstream_request = request.Request(
            target_url,
            data=body,
            headers=headers,
            method="POST",
        )

        try:
            with request.urlopen(
                upstream_request,
                timeout=config.request_timeout_sec,
            ) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"Upstream llama.cpp request failed: {exc.code} {detail}".strip(),
            ) from exc
        except error.URLError as exc:
            raise RuntimeError(f"Failed to reach upstream llama.cpp server: {exc.reason}") from exc

        if not isinstance(payload, dict):
            raise RuntimeError("Invalid upstream response: JSON object expected")

        return BackendCompletionResult(
            content=extract_content(payload),
            raw_response=payload,
        )


class ConfiguredLlamaBackend:
    name = "configured"

    def __init__(self, proxy_backend: InferenceBackend | None = None) -> None:
        self._proxy_backend = proxy_backend or ProxyLlamaCppBackend()

    def complete_chat(
        self,
        request_data: ChatCompletionsRequest,
        config: LlamaServerConfig,
    ) -> BackendCompletionResult:
        if config.mock_response_text is not None:
            return BackendCompletionResult(content=config.mock_response_text)

        if config.upstream_api_base:
            return self._proxy_backend.complete_chat(request_data, config)

        raise RuntimeError(
            "No inference backend configured. Set LLAMA_CPP_API_BASE or LLAMA_SERVER_RESPONSE_TEXT.",
        )
