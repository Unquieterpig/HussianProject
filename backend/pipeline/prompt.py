"""Build the system + user messages sent to the model."""

from __future__ import annotations

from typing import List, Optional, Tuple

from ..providers.base import Message

DEFAULT_FRAMEWORK = {
    "python": "pytest",
    "javascript": "Jest",
    "typescript": "Jest (with ts-jest)",
    "java": "JUnit 5",
    "go": "the standard `testing` package",
    "ruby": "RSpec",
    "php": "PHPUnit",
    "rust": "the built-in `#[test]` module",
    "csharp": "xUnit",
    "kotlin": "JUnit 5",
    "swift": "XCTest",
    "scala": "ScalaTest",
    "c": "the Unity test framework",
    "cpp": "GoogleTest",
}

SYSTEM_PROMPT = """\
You are TESTFORGE, a precise automated test-generation engine. Given source code,
you produce thorough, runnable test cases.

Rules:
- First emit a short `## STRATEGY` section: 3-6 bullets naming the behaviours and
  edge cases you will cover. Keep it brief.
- Then emit `## TESTS`. For each test file, write a line of the form
  `// FILE: <relative/path/to/test_file>` (use the comment syntax of the target
  language) immediately followed by a single fenced code block containing ONLY
  runnable test code.
- Cover happy paths, boundary values, invalid input / error handling, and any
  obvious state or ordering concerns.
- Tests must be self-contained and deterministic. Import the code under test by a
  plausible path based on the files you were given.
- Put no prose inside the code blocks. Keep prose outside them minimal.
"""


def build_messages(
    selected: List[Tuple[str, str]],
    *,
    language: str,
    framework_hint: Optional[str] = None,
    swtbench_mode: bool = False,
) -> List[Message]:
    framework = framework_hint or DEFAULT_FRAMEWORK.get(
        language, "the idiomatic test framework for this language"
    )

    parts: List[str] = [
        f"Target language: {language}",
        f"Test framework: {framework}",
        "",
    ]

    if swtbench_mode:
        parts.append(
            "SWT-BENCH MODE: Generate tests that specify intended behaviour such "
            "that they FAIL on buggy or incomplete code and PASS once the code is "
            "correct. Favour behaviour specification over implementation details.\n"
        )

    parts.append("Source files:\n")
    for path, text in selected:
        parts.append(f"----- FILE: {path} -----")
        parts.append("```")
        parts.append(text)
        parts.append("```")

    parts.append(
        "\nGenerate thorough, runnable test cases following the rules above."
    )

    return [
        Message("system", SYSTEM_PROMPT),
        Message("user", "\n".join(parts)),
    ]
