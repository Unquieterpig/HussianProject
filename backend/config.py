"""Configuration: provider presets, environment, and key resolution.

A "provider" here is any OpenAI-compatible /chat/completions endpoint. DeepSeek,
OpenAI, a local vLLM/Ollama server, and (eventually) the project's own SWT-Bench
scaffold all speak the same protocol, so swapping models is just a base_url +
model name change. The "mock" provider needs no network and is for trying the UI.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parent.parent

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN") or None

# Each preset is a starting point the UI exposes. Users can always override
# base_url / model / api_key per request (that is how a custom scaffold is wired).
PRESETS: dict[str, dict] = {
    "deepseek": {
        "label": "DeepSeek",
        "base_url": "https://api.deepseek.com",
        "models": ["deepseek-chat", "deepseek-reasoner"],
        "api_key_env": "DEEPSEEK_API_KEY",
        "supports_reasoning": True,
        "needs_base_url": False,
    },
    "openai": {
        "label": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "models": ["gpt-4o", "gpt-4o-mini", "o3-mini"],
        "api_key_env": "OPENAI_API_KEY",
        "supports_reasoning": False,
        "needs_base_url": False,
    },
    "custom": {
        "label": "Custom / Your scaffold (OpenAI-compatible)",
        "base_url": "",
        "models": [],
        "api_key_env": "CUSTOM_API_KEY",
        "supports_reasoning": True,
        "needs_base_url": True,
    },
    "mock": {
        "label": "Demo / Mock (no API key)",
        "base_url": "",
        "models": ["mock-tester"],
        "api_key_env": None,
        "supports_reasoning": False,
        "needs_base_url": False,
    },
}


def get_api_key(provider_id: str, preset: dict | None) -> str | None:
    """Resolve an API key from the environment for a provider."""
    if provider_id == "mock":
        return "n/a"
    env_name = (preset or {}).get("api_key_env")
    if env_name:
        value = os.getenv(env_name)
        if value:
            return value
    # Generic fallback, e.g. MYPROVIDER_API_KEY
    return os.getenv(f"{provider_id.upper().replace('-', '_')}_API_KEY")


def public_presets() -> list[dict]:
    """Provider metadata safe to send to the browser (no secrets)."""
    out: list[dict] = []
    for pid, preset in PRESETS.items():
        out.append(
            {
                "id": pid,
                "label": preset["label"],
                "base_url": preset.get("base_url", ""),
                "models": preset.get("models", []),
                "needs_base_url": preset.get("needs_base_url", False),
                "supports_reasoning": preset.get("supports_reasoning", False),
                "key_present": bool(get_api_key(pid, preset)),
            }
        )
    return out
