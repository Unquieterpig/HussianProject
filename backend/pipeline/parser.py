"""Turn the model's text into discrete test files, and write them to disk."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import List

from ..config import PROJECT_ROOT

EXT_FOR_LANG = {
    "python": ".py",
    "javascript": ".test.js",
    "typescript": ".test.ts",
    "java": ".java",
    "go": "_test.go",
    "ruby": "_spec.rb",
    "php": "Test.php",
    "rust": ".rs",
    "csharp": "Tests.cs",
    "kotlin": ".kt",
    "swift": "Tests.swift",
    "scala": "Spec.scala",
    "c": "_test.c",
    "cpp": "_test.cpp",
}

FENCE_RE = re.compile(r"```([\w+.\-]*)\r?\n(.*?)```", re.DOTALL)
FILE_MARKER_RE = re.compile(r"(?:#|//|<!--|;)\s*FILE:\s*([^\s*]+)", re.IGNORECASE)


@dataclass
class TestFile:
    filename: str
    language: str
    content: str


def parse_tests(text: str, language: str) -> List[TestFile]:
    results: List[TestFile] = []
    default_ext = EXT_FOR_LANG.get(language, ".txt")

    for i, m in enumerate(FENCE_RE.finditer(text), start=1):
        block_lang = (m.group(1) or "").strip()
        code = m.group(2).strip("\n")

        # A FILE: marker may sit just before the block or on its first lines.
        filename = None
        preceding = text[max(0, m.start() - 240) : m.start()]
        markers = FILE_MARKER_RE.findall(preceding)
        if markers:
            filename = markers[-1]
        if not filename:
            head = "\n".join(code.splitlines()[:3])
            inner = FILE_MARKER_RE.search(head)
            if inner:
                filename = inner.group(1)

        if not filename:
            filename = f"test_generated_{i}{default_ext}"

        results.append(
            TestFile(
                filename=filename,
                language=block_lang or language,
                content=code,
            )
        )

    return results


def _sanitize(rel: str) -> str:
    rel = rel.replace("\\", "/").lstrip("/")
    safe_parts = [p for p in rel.split("/") if p not in ("", ".", "..")]
    return "/".join(safe_parts) or "test_generated.txt"


def write_tests(owner: str, repo: str, tests: List[TestFile]) -> str:
    base = PROJECT_ROOT / "output" / f"{owner}-{repo}"
    base.mkdir(parents=True, exist_ok=True)
    for t in tests:
        dest = base / _sanitize(t.filename)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(t.content, encoding="utf-8")
    return str(base)


def tests_as_dicts(tests: List[TestFile]) -> List[dict]:
    return [asdict(t) for t in tests]
