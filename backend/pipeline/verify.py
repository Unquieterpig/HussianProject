"""Run the generated tests against the repo they were written for.

The fail-to-pass criterion is about *executed* tests, so a generated file is only
evidence once pytest has actually collected and run it. This drops the extracted
repo plus the model's test files into a temp dir and runs pytest on the generated
files only (never the repo's own suite), reporting the exit code and output tail.

SECURITY: this executes model-authored code in this process's environment, with
no sandbox. Fine for local benchmark runs; do not expose /api/generate publicly
with verify enabled.
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Dict, List, Tuple

from .parser import TestFile, _sanitize

# pytest's documented exit codes, plus our own -1 for a timeout kill.
EXIT_MEANING = {
    0: "all passed",
    1: "tests failed",
    2: "collection interrupted",
    3: "internal error",
    4: "usage error",
    5: "no tests collected",
    -1: "timed out",
}

DEFAULT_TIMEOUT = 120  # ponytail: fixed; make it a request field if repos vary


def _write_tree(root: Path, blobs: Dict[str, bytes]) -> None:
    for rel, data in blobs.items():
        dest = root / _sanitize(rel)  # _sanitize also blocks zip-slip paths
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)


def run_pytest(
    files: Dict[str, bytes],
    tests: List[TestFile],
    timeout: int = DEFAULT_TIMEOUT,
) -> Tuple[int, str]:
    """Return (pytest exit code, tail of combined stdout+stderr)."""
    targets = [_sanitize(t.filename) for t in tests]
    targets = [t for t in targets if t.endswith(".py")]
    if not targets:
        return 5, "No Python test files among the generated output."

    with tempfile.TemporaryDirectory(prefix="testforge-") as tmp:
        root = Path(tmp)
        _write_tree(root, files)
        _write_tree(root, {_sanitize(t.filename): t.content.encode("utf-8")
                           for t in tests})

        # --color=no: the UI log renders raw text, not ANSI escapes.
        cmd = [sys.executable, "-m", "pytest", "-q", "--no-header", "--color=no",
               "-p", "no:cacheprovider", *targets]
        try:
            proc = subprocess.run(
                cmd, cwd=root, capture_output=True, text=True,
                timeout=timeout, errors="replace",
            )
        except subprocess.TimeoutExpired:
            return -1, f"pytest exceeded {timeout}s and was killed."

        # ponytail: no dependency install, so repos with third-party imports
        # fail at collection. Add a per-repo uv/venv step if that dominates.
        return proc.returncode, (proc.stdout + proc.stderr)[-4000:]


def _demo() -> None:
    """Self-check:  python -m backend.pipeline.verify"""
    repo = {"calc.py": b"def add(a, b):\n    return a + b\n"}
    src = "from calc import add\n\ndef test_add():\n    assert add(1, 2) == {}\n"

    code, out = run_pytest(repo, [TestFile("test_ok.py", "python", src.format(3))])
    assert code == 0, out
    assert "[" not in out, "ANSI escapes leak into the UI log"
    code, out = run_pytest(repo, [TestFile("test_bad.py", "python", src.format(4))])
    assert code == 1, out
    code, out = run_pytest(repo, [TestFile("notes.txt", "text", "not code")])
    assert code == 5, out
    # a path trying to escape the temp dir is sanitized, not honoured
    code, out = run_pytest(repo, [TestFile("../../evil.py", "python", src.format(3))])
    assert code in (0, 5), out
    print("verify self-check OK")


if __name__ == "__main__":
    _demo()
