"""LLM provider abstraction.

Everything the pipeline needs from a model lives behind ``LLMProvider`` so that
DeepSeek, OpenAI, a local server, or the project's own SWT-Bench scaffold are
interchangeable. See ``base.py`` for the contract and ``registry.py`` for how a
provider id is turned into a concrete instance.
"""

from .base import Chunk, LLMProvider, Message
from .registry import build_provider

__all__ = ["Chunk", "LLMProvider", "Message", "build_provider"]
