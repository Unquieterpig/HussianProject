"""Run the full pipeline as a stream of UI events.

Yields plain dicts (serialized to NDJSON by the API layer). Event types:
  stage     - a pipeline phase changed; carries a 0..1 progress value
  log       - a status-log line (level: info | ok | warn)
  reasoning - a delta of the model's chain-of-thought channel
  token     - a delta of the model's visible output
  result    - the parsed test files + stats (terminal payload)
  error     - something failed; pipeline stops
  done      - stream finished (always emitted last)
"""

from __future__ import annotations

from typing import AsyncIterator, Dict

from .. import config
from ..models import GenerateRequest
from ..providers import build_provider
from .parser import parse_tests, tests_as_dicts, write_tests
from .prompt import build_messages
from .repo import download_repo_zip, extract_zip, parse_repo_url
from .selector import select_files

# Progress band reserved for live token streaming (start -> end).
_LLM_PROGRESS_START = 0.40
_LLM_PROGRESS_END = 0.88


async def run_pipeline(req: GenerateRequest) -> AsyncIterator[Dict]:
    try:
        yield {"type": "stage", "stage": "init", "progress": 0.02,
               "message": f"TESTFORGE starting for {req.repo_url}"}

        # --- 1. Resolve repo -------------------------------------------------
        owner, repo, url_ref = parse_repo_url(req.repo_url)
        ref = req.ref or url_ref
        label = f"{owner}/{repo}" + (f"@{ref}" if ref else "")
        yield {"type": "log", "level": "info", "stage": "clone",
               "message": f"Resolved repository {label}"}

        # --- 2. Download + extract ------------------------------------------
        yield {"type": "stage", "stage": "clone", "progress": 0.08,
               "message": "Downloading repository archive..."}
        data = await download_repo_zip(owner, repo, ref, token=config.GITHUB_TOKEN)
        files = extract_zip(data)
        yield {"type": "log", "level": "ok", "stage": "clone",
               "message": f"Archive {len(data)//1024} KB, {len(files)} files extracted"}

        # --- 3. Select source files ----------------------------------------
        yield {"type": "stage", "stage": "select", "progress": 0.20,
               "message": "Selecting source files within budget..."}
        selected, stats = select_files(
            files,
            max_files=req.max_files,
            max_bytes=req.max_bytes,
            include_globs=req.include_globs,
            skip_tests=req.skip_tests,
        )
        if not selected:
            raise RuntimeError(
                "No source files matched. Adjust include patterns, raise the size "
                "budget, or check the repo actually contains supported code."
            )
        for path, _ in selected:
            yield {"type": "log", "level": "info", "stage": "select",
                   "message": f"  + {path}"}
        yield {"type": "log", "level": "ok", "stage": "select",
               "message": (f"Selected {stats['file_count']}/{stats['considered']} files, "
                           f"{stats['bytes']//1024} KB, ~{stats['tokens']} tokens, "
                           f"language={stats['language']}")}

        # --- 4. Build prompt + provider ------------------------------------
        yield {"type": "stage", "stage": "prompt", "progress": 0.30,
               "message": "Composing prompt..."}
        messages = build_messages(
            selected,
            language=stats["language"],
            framework_hint=req.framework_hint,
            swtbench_mode=req.swtbench_mode,
        )
        provider = build_provider(req.provider, base_url=req.base_url, api_key=req.api_key)
        if req.provider != "mock" and not getattr(provider, "api_key", ""):
            raise RuntimeError(
                f"No API key found for provider '{req.provider}'. Add it to .env "
                "or paste a key in the UI."
            )
        yield {"type": "log", "level": "info", "stage": "llm",
               "message": (f"Provider={provider.label}  model={req.model}  "
                           f"temp={req.temperature}"
                           + ("  [SWT-BENCH MODE]" if req.swtbench_mode else ""))}

        # --- 5. Stream generation ------------------------------------------
        yield {"type": "stage", "stage": "llm", "progress": _LLM_PROGRESS_START,
               "message": "Generating test cases (streaming)..."}
        full: list[str] = []
        reasoning_seen = False
        emitted = 0
        async for chunk in provider.stream(
            messages,
            model=req.model,
            temperature=req.temperature,
            max_tokens=req.max_output_tokens,
        ):
            if chunk.reasoning:
                reasoning_seen = True
                yield {"type": "reasoning", "text": chunk.reasoning}
            if chunk.content:
                full.append(chunk.content)
                yield {"type": "token", "text": chunk.content}
                emitted += 1
                # Nudge the progress bar forward as output accumulates.
                if emitted % 24 == 0:
                    frac = min(1.0, emitted / 800.0)
                    progress = _LLM_PROGRESS_START + frac * (
                        _LLM_PROGRESS_END - _LLM_PROGRESS_START
                    )
                    yield {"type": "stage", "stage": "llm", "progress": progress,
                           "message": "Generating test cases (streaming)..."}

        text = "".join(full)
        if not text.strip():
            raise RuntimeError("Model returned no output.")

        # --- 6. Parse ------------------------------------------------------
        yield {"type": "stage", "stage": "parse", "progress": 0.92,
               "message": "Parsing generated test files..."}
        tests = parse_tests(text, language=stats["language"])
        yield {"type": "log", "level": "ok", "stage": "parse",
               "message": f"Parsed {len(tests)} test file(s)"}

        # --- 7. Optionally write to disk -----------------------------------
        out_dir = None
        if req.write_output and tests:
            out_dir = write_tests(owner, repo, tests)
            yield {"type": "log", "level": "ok", "stage": "write",
                   "message": f"Wrote test files to {out_dir}"}

        # --- 8. Result -----------------------------------------------------
        yield {
            "type": "result",
            "tests": tests_as_dicts(tests),
            "raw": text,
            "stats": stats,
            "reasoning_seen": reasoning_seen,
            "out_dir": out_dir,
            "repo": label,
        }
        yield {"type": "stage", "stage": "done", "progress": 1.0,
               "message": "Complete."}
        yield {"type": "done"}

    except Exception as exc:  # surface any failure to the UI, then end cleanly
        yield {"type": "error", "message": str(exc)}
        yield {"type": "done"}
