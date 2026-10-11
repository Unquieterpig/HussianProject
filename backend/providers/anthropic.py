"""Native provider for Anthropic's Messages API (Claude).

Claude does not speak the OpenAI /chat/completions protocol, so it gets its own
small provider instead of going through OpenAICompatibleProvider: different
endpoint (/v1/messages), auth headers (x-api-key + anthropic-version), a
top-level `system` field, and a different streaming event shape. Raw httpx, to
match the other providers — no SDK dependency.
"""

from __future__ import annotations

import json
from typing import AsyncIterator, List, Optional, Tuple

import httpx

from .base import Chunk, LLMProvider, Message, http_error

ANTHROPIC_VERSION = "2023-06-01"


def _split_system(messages: List[Message]) -> Tuple[str, List[dict]]:
    """Claude takes the system prompt as a top-level field; everything else is
    a user/assistant turn."""
    system = "\n\n".join(m.content for m in messages if m.role == "system")
    convo = [
        {"role": m.role, "content": m.content}
        for m in messages
        if m.role != "system"
    ]
    return system, convo


def _decode(obj: dict) -> Optional[Chunk]:
    """Map one Anthropic SSE event to a Chunk (or None to ignore it)."""
    etype = obj.get("type")
    if etype == "content_block_delta":
        delta = obj.get("delta") or {}
        dtype = delta.get("type")
        if dtype == "text_delta":
            return Chunk(content=delta.get("text", ""))
        if dtype == "thinking_delta":
            return Chunk(reasoning=delta.get("thinking", ""))
    elif etype == "error":
        err = obj.get("error") or {}
        raise RuntimeError(f"Anthropic stream error: {err.get('message', obj)}")
    return None


class AnthropicProvider(LLMProvider):
    id = "anthropic"
    label = "Anthropic Claude"

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str = "https://api.anthropic.com",
        timeout: float = 600.0,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    async def stream(
        self,
        messages: List[Message],
        *,
        model: str,
        temperature: float = 0.2,
        max_tokens: Optional[int] = None,
    ) -> AsyncIterator[Chunk]:
        system, convo = _split_system(messages)
        payload: dict = {
            "model": model,
            "max_tokens": max_tokens or 4096,  # required by the Messages API
            "messages": convo,
            "stream": True,
        }
        if system:
            payload["system"] = system
        # ponytail: temperature deliberately omitted — Opus 4.8/4.7 reject it (400),
        # it's optional elsewhere. One request shape that's valid on every Claude model.

        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": ANTHROPIC_VERSION,
            "content-type": "application/json",
        }
        url = f"{self.base_url}/v1/messages"

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as resp:
                if resp.status_code >= 400:
                    body = (await resp.aread()).decode("utf-8", "replace")
                    raise http_error("Anthropic API", resp.status_code, body)
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[len("data:") :].strip()
                    if not data:
                        continue
                    try:
                        obj = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    chunk = _decode(obj)
                    if chunk is not None:
                        yield chunk
