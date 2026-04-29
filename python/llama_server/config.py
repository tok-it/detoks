from __future__ import annotations

import os
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

DEFAULT_MODEL_NAME = "mradermacher/gemma-4-e2b-it-heretic-ara-GGUF:Q4_K_S"


class LlamaServerConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    host: str = Field(default="127.0.0.1")
    port: int = Field(default=12370, ge=1, le=65535)
    api_prefix: str = Field(default="/v1", min_length=1)
    health_path: str = Field(default="/health", min_length=1)
    model_name: str = Field(default=DEFAULT_MODEL_NAME, min_length=1)
    request_timeout_sec: float = Field(default=30.0, gt=0)
    api_key: str | None = Field(default=None)
    upstream_api_base: str | None = Field(default=None)
    upstream_api_key: str | None = Field(default=None)
    mock_response_text: str | None = Field(default=None)


def _parse_env_file(content: str) -> dict[str, str]:
    parsed: dict[str, str] = {}

    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        normalized = line.removeprefix("export ")
        separator_index = normalized.find("=")
        if separator_index <= 0:
            continue

        key = normalized[:separator_index].strip()
        value = normalized[separator_index + 1 :].strip()

        if (
            len(value) >= 2
            and value[0] == value[-1]
            and value[0] in {'"', "'"}
        ):
            value = value[1:-1]

        parsed[key] = value

    return parsed


def _load_dotenv_files(cwd: Path) -> dict[str, str]:
    parsed: dict[str, str] = {}
    for file_name in (".env", ".env.local"):
        file_path = cwd / file_name
        if file_path.exists():
            parsed.update(_parse_env_file(file_path.read_text(encoding="utf-8")))
    return parsed


def load_llama_server_config(env: dict[str, str] | None = None) -> LlamaServerConfig:
    source: dict[str, str]
    if env is not None:
        source = env
    else:
        source = {**_load_dotenv_files(Path.cwd()), **os.environ}

    return LlamaServerConfig(
        host=source.get("LLAMA_SERVER_HOST", "127.0.0.1"),
        port=int(source.get("LLAMA_SERVER_PORT", "12370")),
        api_prefix=source.get("LLAMA_SERVER_API_PREFIX", "/v1"),
        health_path=source.get("LLAMA_SERVER_HEALTH_PATH", "/health"),
        model_name=source.get(
            "LOCAL_LLM_MODEL_NAME",
            source.get("MODEL_NAME", DEFAULT_MODEL_NAME),
        ),
        request_timeout_sec=float(source.get("REQUEST_TIMEOUT", "30")),
        api_key=source.get("LLAMA_SERVER_API_KEY"),
        upstream_api_base=source.get("LLAMA_CPP_API_BASE"),
        upstream_api_key=source.get("LLAMA_CPP_API_KEY"),
        mock_response_text=source.get("LLAMA_SERVER_RESPONSE_TEXT"),
    )
