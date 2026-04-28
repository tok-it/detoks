from __future__ import annotations

import json
import os
import sys
from typing import Any

from headroom.transforms.kompress_compressor import (
    KompressCompressor,
    KompressConfig,
)

DEFAULT_MODEL_ID = "chopratejas/kompress-base"


def _emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _build_compressor() -> KompressCompressor:
    model_id = os.environ.get("KOMPRESS_MODEL_ID", DEFAULT_MODEL_ID)
    return KompressCompressor(
        KompressConfig(
            model_id=model_id,
            enable_ccr=False,
        )
    )


def main() -> int:
    try:
        compressor = _build_compressor()
    except Exception as exc:  # pragma: no cover - startup failure path
        _emit(
            {
                "type": "startup_error",
                "error": str(exc),
            }
        )
        return 1

    model_id = os.environ.get("KOMPRESS_MODEL_ID", DEFAULT_MODEL_ID)
    _emit(
        {
            "type": "ready",
            "model_id": model_id,
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
            result = compressor.compress(text)
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
                "model_used": result.model_used,
            }
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
