from __future__ import annotations

import os

from pydantic import BaseModel, ConfigDict, Field

DEFAULT_MODEL_NAME = "mradermacher/gemma-4-E2B-it-heretic-ara-GGUF"


class LlamaServerConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    host: str = Field(default="127.0.0.1")
    port: int = Field(default=1234, ge=1, le=65535)
    api_prefix: str = Field(default="/v1", min_length=1)
    health_path: str = Field(default="/health", min_length=1)
    model_name: str = Field(default=DEFAULT_MODEL_NAME, min_length=1)
    request_timeout_sec: float = Field(default=30.0, gt=0)
    api_key: str | None = Field(default=None)
    upstream_api_base: str | None = Field(default=None)
    upstream_api_key: str | None = Field(default=None)
    mock_response_text: str | None = Field(default=None)


def load_llama_server_config(env: dict[str, str] | None = None) -> LlamaServerConfig:
    source = env or os.environ

    return LlamaServerConfig(
        host=source.get("LLAMA_SERVER_HOST", "127.0.0.1"),
        port=int(source.get("LLAMA_SERVER_PORT", "1234")),
        api_prefix=source.get("LLAMA_SERVER_API_PREFIX", "/v1"),
        health_path=source.get("LLAMA_SERVER_HEALTH_PATH", "/health"),
        model_name=source.get("MODEL_NAME", DEFAULT_MODEL_NAME),
        request_timeout_sec=float(source.get("REQUEST_TIMEOUT", "30")),
        api_key=source.get("LLAMA_SERVER_API_KEY"),
        upstream_api_base=source.get("LLAMA_CPP_API_BASE"),
        upstream_api_key=source.get("LLAMA_CPP_API_KEY"),
        mock_response_text=source.get("LLAMA_SERVER_RESPONSE_TEXT"),
    )
