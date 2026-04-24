from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from pydantic import ValidationError

from .backend import ConfiguredLlamaBackend, InferenceBackend
from .config import LlamaServerConfig, load_llama_server_config
from .schemas import (
    ChatCompletionChoice,
    ChatCompletionMessage,
    ChatCompletionsRequest,
    ChatCompletionsResponse,
    HealthResponse,
)


@dataclass(frozen=True)
class HttpResponse:
    status_code: int
    body: dict[str, Any]


def _normalize_path(raw_path: str) -> str:
    return raw_path.split("?", 1)[0]


def _require_auth(headers: dict[str, str], config: LlamaServerConfig) -> str | None:
    if not config.api_key:
        return None

    received = headers.get("authorization")
    expected = f"Bearer {config.api_key}"
    if received == expected:
        return None

    return "Unauthorized"


def build_health_response(
    config: LlamaServerConfig,
    backend: InferenceBackend,
) -> HttpResponse:
    payload = HealthResponse(
        ok=bool(config.mock_response_text is not None or config.upstream_api_base),
        model=config.model_name,
        backend=backend.name,
    )
    return HttpResponse(status_code=HTTPStatus.OK, body=payload.model_dump())


def build_chat_completions_response(
    raw_body: bytes,
    headers: dict[str, str],
    config: LlamaServerConfig,
    backend: InferenceBackend,
) -> HttpResponse:
    auth_error = _require_auth(headers, config)
    if auth_error:
        return HttpResponse(
            status_code=HTTPStatus.UNAUTHORIZED,
            body={"error": {"message": auth_error}},
        )

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError:
        return HttpResponse(
            status_code=HTTPStatus.BAD_REQUEST,
            body={"error": {"message": "Invalid JSON body"}},
        )

    try:
        request_data = ChatCompletionsRequest.model_validate(payload)
    except ValidationError as exc:
        return HttpResponse(
            status_code=HTTPStatus.BAD_REQUEST,
            body={
                "error": {
                    "message": "Invalid chat completions request",
                    "details": exc.errors(),
                },
            },
        )

    try:
        backend_result = backend.complete_chat(request_data, config)
    except Exception as exc:
        return HttpResponse(
            status_code=HTTPStatus.SERVICE_UNAVAILABLE,
            body={"error": {"message": str(exc)}},
        )

    response = ChatCompletionsResponse(
        id=f"chatcmpl-{uuid.uuid4().hex}",
        created=int(time.time()),
        model=request_data.model,
        choices=[
            ChatCompletionChoice(
                message=ChatCompletionMessage(content=backend_result.content),
            ),
        ],
        raw_response=backend_result.raw_response,
    )
    return HttpResponse(status_code=HTTPStatus.OK, body=response.model_dump())


def create_http_server(
    config: LlamaServerConfig | None = None,
    backend: InferenceBackend | None = None,
) -> ThreadingHTTPServer:
    resolved_config = config or load_llama_server_config()
    resolved_backend = backend or ConfiguredLlamaBackend()

    class LlamaServerHandler(BaseHTTPRequestHandler):
        server_version = "detoks-llama-server/0.1"

        def _write_json(self, response: HttpResponse) -> None:
            encoded = json.dumps(response.body).encode("utf-8")
            self.send_response(response.status_code)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def do_GET(self) -> None:  # noqa: N802
            path = _normalize_path(self.path)
            if path != resolved_config.health_path:
                self._write_json(
                    HttpResponse(
                        status_code=HTTPStatus.NOT_FOUND,
                        body={"error": {"message": "Not found"}},
                    ),
                )
                return

            self._write_json(build_health_response(resolved_config, resolved_backend))

        def do_POST(self) -> None:  # noqa: N802
            path = _normalize_path(self.path)
            expected_path = f"{resolved_config.api_prefix.rstrip('/')}/chat/completions"
            if path != expected_path:
                self._write_json(
                    HttpResponse(
                        status_code=HTTPStatus.NOT_FOUND,
                        body={"error": {"message": "Not found"}},
                    ),
                )
                return

            content_length = int(self.headers.get("content-length", "0"))
            raw_body = self.rfile.read(content_length)
            headers = {key.lower(): value for key, value in self.headers.items()}
            response = build_chat_completions_response(
                raw_body=raw_body,
                headers=headers,
                config=resolved_config,
                backend=resolved_backend,
            )
            self._write_json(response)

        def log_message(self, format: str, *args: object) -> None:
            return

    return ThreadingHTTPServer((resolved_config.host, resolved_config.port), LlamaServerHandler)


def serve(
    config: LlamaServerConfig | None = None,
    backend: InferenceBackend | None = None,
) -> None:
    httpd = create_http_server(config=config, backend=backend)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
