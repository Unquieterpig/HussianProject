"""A no-network provider so the whole pipeline + UI can be exercised offline.

It streams a canned strategy and a couple of pytest test files token-by-token so
the status log, progress bar, and live generation panel all behave exactly as
they do with a real model.
"""

from __future__ import annotations

import asyncio
import re
from typing import AsyncIterator, List, Optional

from .base import Chunk, LLMProvider, Message

_CANNED = """\
## STRATEGY
- Enumerate the public functions and classes in the provided sources.
- Cover happy paths, boundary values, and invalid-input / error handling.
- Use pytest with parametrization to keep cases compact.
- Keep each test isolated and deterministic.

## TESTS

// FILE: tests/test_generated.py
```python
import pytest


def test_smoke():
    \"\"\"The module under test imports and basic wiring works.\"\"\"
    assert True


@pytest.mark.parametrize("a,b,expected", [(1, 1, 2), (0, 0, 0), (-1, 1, 0)])
def test_addition_examples(a, b, expected):
    assert a + b == expected


def test_rejects_bad_input():
    with pytest.raises((TypeError, ValueError)):
        int("not-a-number")
```
"""


def _tokenize(text: str) -> List[str]:
    # Split into word-ish chunks so streaming looks natural.
    return re.findall(r"\S+\s*|\s+", text)


class MockProvider(LLMProvider):
    id = "mock"
    label = "Demo / Mock"

    def __init__(self, *_, **__) -> None:
        self.api_key = "n/a"

    async def stream(
        self,
        messages: List[Message],
        *,
        model: str = "mock-tester",
        temperature: float = 0.2,
        max_tokens: Optional[int] = None,
    ) -> AsyncIterator[Chunk]:
        yield Chunk(reasoning="Mock reasoning: scanning sources, planning cases...\n")
        await asyncio.sleep(0.05)
        for tok in _tokenize(_CANNED):
            await asyncio.sleep(0.012)
            yield Chunk(content=tok)
