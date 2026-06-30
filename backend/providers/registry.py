"""Turn a provider id (+ optional overrides) into a concrete ``LLMProvider``."""

from __future__ import annotations

from typing import Optional

from ..config import PRESETS, get_api_key
from .anthropic import AnthropicProvider
from .base import LLMProvider
from .mock import MockProvider
from .openai_compatible import OpenAICompatibleProvider


def build_provider(
    provider_id: str,
    *,
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
) -> LLMProvider:
    if provider_id == "mock":
        return MockProvider()

    preset = PRESETS.get(provider_id)
    if preset is None and provider_id != "custom":
        raise ValueError(f"Unknown provider '{provider_id}'.")

    if provider_id == "anthropic":  # native Messages API, not OpenAI-compatible
        return AnthropicProvider(
            api_key=api_key or get_api_key(provider_id, preset) or "",
            base_url=base_url or preset["base_url"],
        )

    resolved_base = (base_url or (preset or {}).get("base_url") or "").strip()
    if not resolved_base:
        raise ValueError(
            f"Provider '{provider_id}' needs a base_url "
            "(e.g. https://your-scaffold.example/v1)."
        )

    resolved_key = api_key or get_api_key(provider_id, preset) or ""

    return OpenAICompatibleProvider(
        id=provider_id,
        label=(preset or {}).get("label", provider_id),
        base_url=resolved_base,
        api_key=resolved_key,
    )
