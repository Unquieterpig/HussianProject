"""Provider for any OpenAI-compatible /chat/completions endpoint.

Covers DeepSeek, OpenAI, vLLM, Ollama (OpenAI mode), LM Studio, and the project's
own scaffold if it is served behind the same protocol. Streaming is parsed from
the standard ``data: {...}`` SSE frames.
"""

from __future__ import annotations

import json
from typing import AsyncIterator, List, Optional

import httpx

from .base import Chunk, LLMProvider, Message, http_error


class OpenAICompatibleProvider(LLMProvider):
    def __init__(
        self,
        *,
        id: str,
        label: str,
        base_url: str,
        api_key: str,
        timeout: float = 600.0,
    ) -> None:
        self.id = id
        self.label = label
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    async def stream(
        self,
        messages: List[Message],
        *,
        model: str,
        temperature: float = 0.2,
        max_tokens: Optional[int] = None,
    ) -> AsyncIterator[Chunk]:
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload: dict = {
            "model": model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": temperature,
            "stream": True,
        }
        if max_tokens:
            payload["max_tokens"] = max_tokens

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as resp:
                if resp.status_code >= 400:
                    body = (await resp.aread()).decode("utf-8", "replace")
                    raise http_error(self.label, resp.status_code, body)
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[len("data:") :].strip()
                    if data == "[DONE]":
                        break
                    try:
                        obj = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    choices = obj.get("choices") or []
                    if not choices:
                        continue
                    delta = choices[0].get("delta") or {}
                    content = delta.get("content") or ""
                    reasoning = (
                        delta.get("reasoning_content")
                        or delta.get("reasoning")
                        or ""
                    )
                    if content or reasoning:
                        yield Chunk(content=content, reasoning=reasoning)
