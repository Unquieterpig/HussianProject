"""Choose which source files to send to the model, under a size/file budget.

Real repos are far larger than any context window, so this scores candidate
files (dominant language, density of definitions, shallow paths, non-vendored,
moderate size) and accumulates the best ones until the budget is reached.
"""

from __future__ import annotations

import fnmatch
import os
import re
from typing import Dict, List, Optional, Tuple

CODE_EXT = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".java": "java",
    ".go": "go",
    ".rb": "ruby",
    ".php": "php",
    ".rs": "rust",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".hpp": "cpp",
    ".cs": "csharp",
    ".kt": "kotlin",
    ".swift": "swift",
    ".scala": "scala",
}

SKIP_DIRS = {
    ".git", "node_modules", "dist", "build", "vendor", "venv", ".venv",
    "__pycache__", "target", ".next", "out", "site-packages", ".tox",
    "coverage", ".mypy_cache", ".pytest_cache", "third_party", ".idea",
    "examples", "docs",
}

TEST_HINT = re.compile(
    r"(^|/)(tests?|spec|__tests__)(/|$)|(_test\.|test_|\.test\.|\.spec\.)",
    re.IGNORECASE,
)
DEF_HINT = re.compile(
    r"\b(def |class |function |func |public |private |module\.exports|export )"
)

MAX_SINGLE_FILE_BYTES = 80_000


def select_files(
    files: Dict[str, bytes],
    *,
    max_files: int = 10,
    max_bytes: int = 120_000,
    include_globs: Optional[List[str]] = None,
    skip_tests: bool = False,
) -> Tuple[List[Tuple[str, str]], dict]:
    include_globs = include_globs or []
    candidates: List[dict] = []
    lang_counts: Dict[str, int] = {}

    for path, data in files.items():
        parts = path.split("/")
        if any(p in SKIP_DIRS for p in parts):
            continue
        ext = os.path.splitext(path)[1].lower()
        lang = CODE_EXT.get(ext)
        if not lang:
            continue
        forced = any(fnmatch.fnmatch(path, g) for g in include_globs)
        if len(data) > MAX_SINGLE_FILE_BYTES and not forced:
            continue
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            continue
        if not text.strip():
            continue

        lang_counts[lang] = lang_counts.get(lang, 0) + 1
        candidates.append(
            {
                "path": path,
                "text": text,
                "size": len(data),
                "lang": lang,
                "is_test": bool(TEST_HINT.search(path)),
                "forced": forced,
                "depth": len(parts),
                "defs": len(DEF_HINT.findall(text)),
            }
        )

    if not candidates:
        return [], {
            "bytes": 0,
            "tokens": 0,
            "language": "unknown",
            "file_count": 0,
            "considered": 0,
        }

    dominant = max(lang_counts, key=lang_counts.get)

    def score(c: dict) -> int:
        s = 0
        if c["forced"]:
            s += 1000
        if c["lang"] == dominant:
            s += 50
        if c["is_test"]:
            s += -100 if skip_tests else -20
        s += min(c["defs"], 20) * 3
        s -= c["depth"] * 2
        s -= abs(c["size"] - 4000) // 2000  # prefer moderately sized files
        return s

    candidates.sort(key=score, reverse=True)

    selected: List[Tuple[str, str]] = []
    total = 0
    for c in candidates:
        if skip_tests and c["is_test"] and not c["forced"]:
            continue
        if len(selected) >= max_files:
            break
        if selected and total + c["size"] > max_bytes:
            continue
        selected.append((c["path"], c["text"]))
        total += c["size"]

    stats = {
        "bytes": total,
        "tokens": total // 4,  # rough chars-per-token estimate
        "language": dominant,
        "file_count": len(selected),
        "considered": len(candidates),
    }
    return selected, stats
