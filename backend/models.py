"""Request/response schemas for the API."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    repo_url: str = Field(..., description="GitHub repo URL or owner/repo shorthand")
    provider: str = "deepseek"
    model: str = "deepseek-chat"

    # Per-request overrides. For a custom OpenAI-compatible scaffold the caller
    # supplies base_url (and optionally api_key) and these win over the preset.
    base_url: Optional[str] = None
    api_key: Optional[str] = None

    ref: Optional[str] = None  # branch / tag / commit
    include_globs: List[str] = []
    skip_tests: bool = False

    max_files: int = 10
    max_bytes: int = 120_000
    temperature: float = 0.2
    max_output_tokens: Optional[int] = 4000

    framework_hint: Optional[str] = None
    swtbench_mode: bool = False
    write_output: bool = True
