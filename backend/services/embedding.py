"""
Embedding service — wraps the Nebius Qwen3-Embedding-8B model.

Produces a float vector that can be stored directly in MongoDB under
the 'embedding' field of any document for future semantic search.

This module is intentionally synchronous so it can be called via
asyncio.to_thread() in the OCR worker without blocking the event loop.
"""

import os
import json
from openai import OpenAI

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    """Lazily create the OpenAI client (shares the NEBIUS_API_KEY used by OCR)."""
    global _client
    if _client is None:
        _client = OpenAI(
            base_url="https://api.tokenfactory.nebius.com/v1/",
            api_key=os.environ.get("NEBIUS_API_KEY"),
        )
    return _client


def _ocr_data_to_text(ocr_data: dict) -> str:
    """
    Convert OCR JSON → a plain-text string for embedding.

    Includes field NAMES alongside values so the embedding model understands
    what each number means, e.g. "creatinine: 1.2 | urea: 28 | unit: mg/dL"
    instead of just "1.2 | 28 | mg/dL".
    """
    if not ocr_data:
        return ""

    def _flatten(obj, parts: list[str], parent_key: str = "") -> None:
        if isinstance(obj, dict):
            for k, v in obj.items():
                _flatten(v, parts, k)
        elif isinstance(obj, list):
            for item in obj:
                _flatten(item, parts, parent_key)
        else:
            val = str(obj).strip()
            if not val or val.lower() in ("none", "null", "n/a", "-", ""):
                return
            if parent_key:
                parts.append(f"{parent_key}: {val}")
            else:
                parts.append(val)

    parts: list[str] = []
    _flatten(ocr_data, parts)
    return " | ".join(parts)


def get_document_embedding(ocr_data: dict) -> list[float]:
    """
    Generate a vector embedding from the OCR-extracted JSON.

    Args:
        ocr_data: The dict returned by the OCR service (prescription or report).

    Returns:
        A list of floats (the embedding vector from Qwen3-Embedding-8B).
        Returns an empty list if the text is blank or the API call fails.
    """
    text = _ocr_data_to_text(ocr_data)
    if not text:
        return []

    response = _get_client().embeddings.create(
        model="Qwen/Qwen3-Embedding-8B",
        input=text,
    )
    return response.data[0].embedding
