"""List a provider's available models (newest first) via its own API.

Lets the UI populate the model dropdown live instead of making users memorise
exact model names. Falls back to the preset's static list whenever the live call
can't run (no key, offline, or an unsupported provider).
"""

from __future__ import annotations

from typing import List, Optional

import httpx

from ..config import PRESETS, get_api_key
from .anthropic import ANTHROPIC_VERSION


async def list_models(
    provider_id: str,
    *,
    base_url: Optional[str] = None,
) -> List[str]:
    preset = PRESETS.get(provider_id) or {}
    fallback = list(preset.get("models", []))
    if provider_id == "mock":
        return fallback

    resolved_base = (base_url or preset.get("base_url") or "").strip()
    key = get_api_key(provider_id, preset) or ""
    if not resolved_base or not key:
        return fallback  # can't query without an endpoint + key

    try:
        if provider_id == "anthropic":
            models = await _anthropic_models(resolved_base, key)
        else:
            models = await _openai_models(resolved_base, key)
        return models or fallback
    except Exception:
        return fallback


def _by_recency(data: list, time_key: str, default) -> List[str]:
    """Model ids newest first. Entries lacking the timestamp keep API order
    (Python's sort is stable) — e.g. DeepSeek's /models has no 'created'."""
    data.sort(key=lambda m: m.get(time_key, default), reverse=True)
    return [m["id"] for m in data if m.get("id")]


async def _openai_models(base_url: str, key: str) -> List[str]:
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(
            f"{base_url.rstrip('/')}/models",
            headers={"Authorization": f"Bearer {key}"},
        )
        resp.raise_for_status()
        data = resp.json().get("data", [])
    return _by_recency(data, "created", 0)  # OpenAI 'created' is a unix timestamp


async def _anthropic_models(base_url: str, key: str) -> List[str]:
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(
            f"{base_url.rstrip('/')}/v1/models",
            headers={"x-api-key": key, "anthropic-version": ANTHROPIC_VERSION},
        )
        resp.raise_for_status()
        data = resp.json().get("data", [])
    return _by_recency(data, "created_at", "")  # ISO-8601; lexical == chronological
