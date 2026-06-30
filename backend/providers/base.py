"""The provider contract every model implementation satisfies.

To add a new backend (e.g. wire the SWT-Bench scaffold in-process instead of over
HTTP), subclass ``LLMProvider`` and implement ``stream``. The pipeline only ever
sees this interface, so nothing else has to change.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncIterator, List, Optional


@dataclass
class Message:
    role: str  # "system" | "user" | "assistant"
    content: str


@dataclass
class Chunk:
    """One streamed delta. ``content`` is visible output; ``reasoning`` is the
    model's separate chain-of-thought channel (DeepSeek-reasoner, o-series) when
    the endpoint exposes one."""

    content: str = ""
    reasoning: str = ""


class LLMProvider(ABC):
    id: str = "base"
    label: str = "Base"

    @abstractmethod
    def stream(
        self,
        messages: List[Message],
        *,
        model: str,
        temperature: float = 0.2,
        max_tokens: Optional[int] = None,
    ) -> AsyncIterator[Chunk]:
        """Yield ``Chunk``s as the model generates. Must be an async generator."""
        raise NotImplementedError
