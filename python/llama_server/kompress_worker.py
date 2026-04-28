from __future__ import annotations

import json
import os
import inspect
import sys
from dataclasses import dataclass
from typing import Any, Protocol

DEFAULT_MODEL_ID = "chopratejas/kompress-base"


class CompressionResultLike(Protocol):
    compressed: str
    compression_ratio: float
    tokens_saved: int


class CompressorLike(Protocol):
    def compress(self, text: str) -> CompressionResultLike: ...


@dataclass(frozen=True)
class WorkerCompressor:
    compressor: CompressorLike
    backend: str
    model_id: str


def _emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _build_official_runner(model_id: str) -> WorkerCompressor:
    from kompress.inference.pytorch_runner import KompressRunner

    try:
        runner = KompressRunner(model_id=model_id)
    except TypeError:
        runner = KompressRunner()

    return WorkerCompressor(
        compressor=runner,
        backend="kompress",
        model_id=model_id,
    )


def _build_headroom_runner(model_id: str) -> WorkerCompressor:
    from headroom.transforms.kompress_compressor import (
        KompressCompressor,
        KompressConfig,
    )

    config_kwargs: dict[str, Any] = {}
    signature = inspect.signature(KompressConfig)
    if "enable_ccr" in signature.parameters:
        config_kwargs["enable_ccr"] = False
    if "model_id" in signature.parameters:
        config_kwargs["model_id"] = model_id

    compressor = KompressCompressor(
        KompressConfig(**config_kwargs)
    )
    return WorkerCompressor(
        compressor=compressor,
        backend="headroom",
        model_id=model_id,
    )


def _build_compressor() -> WorkerCompressor:
    model_id = os.environ.get("KOMPRESS_MODEL_ID", DEFAULT_MODEL_ID)
    official_error: Exception | None = None

    try:
        return _build_official_runner(model_id)
    except Exception as exc:
        official_error = exc

    try:
        return _build_headroom_runner(model_id)
    except Exception as fallback_exc:
        details = [
            f"official import failed: {type(official_error).__name__}: {official_error}"
            if official_error is not None
            else "official import failed: unknown error",
            f"headroom fallback failed: {type(fallback_exc).__name__}: {fallback_exc}",
        ]
        raise RuntimeError("; ".join(details)) from fallback_exc


def main() -> int:
    try:
        worker = _build_compressor()
    except Exception as exc:  # pragma: no cover - startup failure path
        _emit(
            {
                "type": "startup_error",
                "error": str(exc),
            }
        )
        return 1

    _emit(
        {
            "type": "ready",
            "model_id": worker.model_id,
            "backend": worker.backend,
        }
    )

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        request_id = ""

        try:
            payload = json.loads(line)
        except json.JSONDecodeError as exc:
            _emit(
                {
                    "id": request_id,
                    "ok": False,
                    "error": f"Invalid JSON request: {exc.msg}",
                }
            )
            continue

        if not isinstance(payload, dict):
            _emit(
                {
                    "id": request_id,
                    "ok": False,
                    "error": "Invalid request payload",
                }
            )
            continue

        raw_request_id = payload.get("id")
        text = payload.get("text")
        request_id = raw_request_id if isinstance(raw_request_id, str) else ""

        if not request_id or not isinstance(text, str):
            _emit(
                {
                    "id": request_id,
                    "ok": False,
                    "error": "Request must include string id and text",
                }
            )
            continue

        try:
            result = worker.compressor.compress(text)
        except Exception as exc:  # pragma: no cover - runtime failure path
            _emit(
                {
                    "id": request_id,
                    "ok": False,
                    "error": str(exc),
                }
            )
            continue

        _emit(
            {
                "id": request_id,
                "ok": True,
                "compressed": result.compressed,
                "compression_ratio": result.compression_ratio,
                "tokens_saved": result.tokens_saved,
                "model_used": getattr(result, "model_used", worker.model_id),
                "backend": worker.backend,
            }
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
