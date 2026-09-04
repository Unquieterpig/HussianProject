"""Issue mode: a GitHub issue -> an LLM reproduction test -> run at the buggy
and the fixed commit, next to the human test from the fix PR.

Closed issue: the merged PR that references it gives a fixed tree (the merge
commit) and a buggy tree (its parent). The model sees the issue plus the files
the fix touched, as they were before the fix. Its tests and the PR's own test
files are then run at both commits. Open issue: no fix exists, so the test is
generated against the current tree and only checked to fail there.

Scoring is Jorgensen's specified / programmed / tested Venn. A test that fails
at base and passes at head is in the centre (caught the bug). Passes at both:
redundant, it never touched the bug. Fails at both: never matched the code.
"""

from __future__ import annotations

import asyncio
import re
from typing import AsyncIterator, Dict, List, Optional, Tuple

import httpx

from .. import config
from ..models import GenerateRequest
from ..providers import build_provider
from .parser import TestFile, parse_tests, tests_as_dicts, write_tests
from .prompt import build_messages
from .repo import download_repo_zip, extract_zip, parse_repo_url
from .runner import stream_llm
from .selector import CODE_EXT, TEST_HINT, select_files
from .verify import EXIT_MEANING, run_pytest

API = "https://api.github.com"


# --- GitHub ---------------------------------------------------------------

async def gh(path: str, **params):
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "testforge"}
    if config.GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {config.GITHUB_TOKEN}"
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        resp = await client.get(API + path, headers=headers, params=params)
    if resp.status_code == 403:
        raise RuntimeError("GitHub rate limit hit. Add a GITHUB_TOKEN to .env to raise it.")
    if resp.status_code == 404:
        raise RuntimeError(f"GitHub: {path} not found (public repo? right number?).")
    if resp.status_code != 200:
        raise RuntimeError(f"GitHub API {path} failed (HTTP {resp.status_code}).")
    return resp.json()


async def list_issues(owner: str, repo: str, state: str = "all", page: int = 1) -> List[dict]:
    """Issues only, newest first (the endpoint mixes in pull requests)."""
    raw = await gh(f"/repos/{owner}/{repo}/issues", state=state, per_page=50, page=page)
    return [{"number": i["number"], "title": i["title"], "state": i["state"]}
            for i in raw if "pull_request" not in i]


async def find_fix_pr(owner: str, repo: str, number: int) -> Optional[int]:
    """The merged PR in this repo that references the issue, else None."""
    full = f"{owner}/{repo}".lower()
    events = await gh(f"/repos/{owner}/{repo}/issues/{number}/timeline", per_page=100)
    # ponytail: first merged cross-reference wins; a "related to #n" PR can win too
    for ev in events:
        src = (ev.get("source") or {}).get("issue") or {}
        pr = src.get("pull_request") or {}
        repo_name = (src.get("repository") or {}).get("full_name", full)
        if ev.get("event") == "cross-referenced" and pr.get("merged_at") \
                and repo_name.lower() == full:
            return src["number"]
    for ev in events:  # closed straight by a commit: ask which PR carried it
        if ev.get("event") == "closed" and ev.get("commit_id"):
            prs = await gh(f"/repos/{owner}/{repo}/commits/{ev['commit_id']}/pulls")
            if prs:
                return prs[0]["number"]
    return None


async def pr_commits(owner: str, repo: str, pr: int) -> Tuple[str, str, List[dict]]:
    """(buggy sha, fixed sha, changed files) for a merged PR."""
    info = await gh(f"/repos/{owner}/{repo}/pulls/{pr}")
    fixed = info.get("merge_commit_sha")
    if not info.get("merged_at") or not fixed:
        raise RuntimeError(f"PR #{pr} is not merged.")
    commit = await gh(f"/repos/{owner}/{repo}/commits/{fixed}")
    parents = commit.get("parents") or []
    # First parent of the merge commit is the tree right before the fix landed
    # (merge commits and single-commit squashes). ponytail: a multi-commit
    # squash/rebase falls back to the PR's recorded base: still pre-fix, maybe older.
    if len(parents) == 2 or info.get("commits") == 1:
        buggy = parents[0]["sha"]
    else:
        buggy = info["base"]["sha"]
    files = await gh(f"/repos/{owner}/{repo}/pulls/{pr}/files", per_page=100)
    return buggy, fixed, files


# --- pure helpers (self-checked in _demo) ---------------------------------

def split_pr_files(changed: List[dict]) -> Tuple[List[str], List[str]]:
    """Changed paths -> (files the fix touched, test files). Removed files dropped."""
    fix: List[str] = []
    tests: List[str] = []
    for f in changed:
        if f.get("status") == "removed":
            continue
        (tests if TEST_HINT.search(f["filename"]) else fix).append(f["filename"])
    return fix, tests


IDENT = re.compile(r"\b[A-Za-z_][A-Za-z0-9_]{4,}\b")
DEF = re.compile(r"^\s*(?:def|class)\s+([A-Za-z_]\w*)", re.M)


def mentioned_files(files: Dict[str, bytes], text: str, limit: int = 5) -> List[str]:
    """Source files the issue points at: named by path or bare filename
    (tracebacks), or defining an identifier the issue mentions (`split_before`).
    Best-ranked first."""
    words = set(IDENT.findall(text))
    scored = []
    for path, data in files.items():
        name = path.rsplit("/", 1)[-1]
        ext = "." + name.rsplit(".", 1)[-1] if "." in name else ""
        if ext not in CODE_EXT or TEST_HINT.search(path):
            continue
        # ponytail: substring + shared-identifier counting; no real fault localisation
        named = len(name) >= 6 and not name.startswith("__init__") \
            and (path in text or name in text)
        try:
            shared = len(set(DEF.findall(data.decode("utf-8"))) & words)
        except UnicodeDecodeError:
            continue
        if named or shared:
            scored.append(((100 if named else 0) + shared, path))
    scored.sort(reverse=True)
    return [p for _, p in scored[:limit]]


def region(base: Optional[int], head: Optional[int]) -> str:
    """Where a test lands in the specified/programmed/tested Venn (pytest exit codes)."""
    if head is None:  # open issue: nothing to pass against yet
        return {1: "fails at base (as it should)",
                0: "passes at base (missed the bug)"}.get(base, "did not run")
    if base not in (0, 1) or head not in (0, 1):
        return "did not run"
    return {(1, 0): "caught the bug", (0, 0): "redundant",
            (1, 1): "fails at both", (0, 1): "contradicts the fix"}[(base, head)]


GOOD = ("caught the bug", "fails at base (as it should)")


# --- pipeline -------------------------------------------------------------

def _stage(stage: str, progress: float, message: str) -> Dict:
    return {"type": "stage", "stage": stage, "progress": progress, "message": message}


def _log(level: str, stage: str, message: str) -> Dict:
    return {"type": "log", "level": level, "stage": stage, "message": message}


def _pick(files: Dict[str, bytes], hint: List[str], req: GenerateRequest):
    return select_files(files, max_files=len(hint) or req.max_files,
                        max_bytes=req.max_bytes,
                        include_globs=hint or req.include_globs, skip_tests=True)


async def run_issue_pipeline(req: GenerateRequest) -> AsyncIterator[Dict]:
    try:
        owner, repo, _ = parse_repo_url(req.repo_url)
        n = req.issue
        yield _stage("init", 0.02, f"TESTFORGE issue mode: {owner}/{repo}#{n}")
        issue = await gh(f"/repos/{owner}/{repo}/issues/{n}")
        if "pull_request" in issue:
            raise RuntimeError(f"#{n} is a pull request, not an issue.")
        closed = issue["state"] == "closed"
        issue_text = (f"GitHub issue #{n}: {issue['title']}\n\n"
                      f"{(issue.get('body') or '')[:6000]}")
        yield _log("info", "issue", f"[{issue['state']}] {issue['title']}")

        pr = buggy = fixed = None
        fix_paths: List[str] = []
        human_paths: List[str] = []
        if closed:
            pr = await find_fix_pr(owner, repo, n)
            if pr is None:
                raise RuntimeError("Closed, but no merged PR references this issue. "
                                   "Pick another one.")
            buggy, fixed, changed = await pr_commits(owner, repo, pr)
            fix_paths, human_paths = split_pr_files(changed)
            yield _log("ok", "issue", f"Fixed by PR #{pr}: {len(fix_paths)} source + "
                                      f"{len(human_paths)} test file(s) changed")
            yield _log("info", "issue", f"buggy={buggy[:10]}  fixed={fixed[:10]}")
        else:
            yield _log("warn", "issue", "Open issue: no fix exists yet, so tests are only "
                                        "checked to FAIL on the current code.")

        yield _stage("clone", 0.08, "Downloading buggy tree...")
        base_files = extract_zip(await download_repo_zip(
            owner, repo, buggy or req.ref, token=config.GITHUB_TOKEN))
        head_files = None
        if fixed:
            yield _stage("clone", 0.14, "Downloading fixed tree...")
            head_files = extract_zip(await download_repo_zip(
                owner, repo, fixed, token=config.GITHUB_TOKEN))
        yield _log("ok", "clone", f"{len(base_files)} files at base"
                   + (f", {len(head_files)} at head" if head_files else ""))

        # What the model sees: the files the fix touched (buggy versions), else
        # the files the issue names, else the selector's usual pick.
        yield _stage("select", 0.20, "Locating the buggy files...")
        selected: list = []
        for source, hint in (("fix-touched", [p for p in fix_paths if p in base_files]),
                             ("issue-mentioned", mentioned_files(base_files, issue_text)),
                             ("heuristic", [])):
            if not hint and source != "heuristic":
                continue
            selected, stats = _pick(base_files, hint, req)
            if hint:  # the selector fills spare slots with unrelated files; keep only hinted ones
                selected = [(p, t) for p, t in selected if p in hint]
                stats["file_count"] = len(selected)
                stats["bytes"] = sum(len(t) for _, t in selected)
                stats["tokens"] = stats["bytes"] // 4
            if selected:
                break
        if not selected:
            raise RuntimeError("No source files found to show the model.")
        for path, _ in selected:
            yield _log("info", "select", f"  + {path}")
        yield _log("ok", "select", f"{source} files: {stats['file_count']}, "
                                   f"{stats['bytes']//1024} KB, language={stats['language']}")

        yield _stage("prompt", 0.30, "Composing prompt...")
        messages = build_messages(selected, language=stats["language"],
                                  framework_hint=req.framework_hint,
                                  issue_text=issue_text)
        provider = build_provider(req.provider, base_url=req.base_url)
        if req.provider != "mock" and not getattr(provider, "api_key", ""):
            raise RuntimeError(f"No API key found for provider '{req.provider}'. "
                               "Add it to .env.")
        yield _log("info", "llm", f"Provider={provider.label}  model={req.model}  "
                                  f"temp={req.temperature}  [ISSUE MODE]")

        yield _stage("llm", 0.40, "Generating reproduction test (streaming)...")
        full: List[str] = []
        async for ev in stream_llm(provider, req, messages, full):
            yield ev
        text = "".join(full)
        if not text.strip():
            raise RuntimeError("Model returned no output.")

        yield _stage("parse", 0.88, "Parsing generated test files...")
        tests = parse_tests(text, language=stats["language"])
        human = [TestFile(p, "python", head_files[p].decode("utf-8", "replace"))
                 for p in human_paths
                 if head_files and p in head_files and p.endswith(".py")]
        yield _log("ok", "parse", f"Parsed {len(tests)} LLM test file(s); "
                                  f"{len(human)} human test file(s) from the PR")

        verdicts: Dict[str, dict] = {}
        if stats["language"] != "python":
            yield _log("warn", "verify", f"pytest only; repo language is "
                                         f"{stats['language']}. Runs skipped.")
        for name, suite in (("llm", tests), ("human", human)):
            if stats["language"] != "python" or not suite:
                continue
            yield _stage("verify", 0.90 if name == "llm" else 0.95,
                         f"Running {name} tests at the buggy commit...")
            b, b_out = await asyncio.to_thread(run_pytest, base_files, suite)
            h, h_out = None, ""
            if head_files:
                yield _stage("verify", 0.92 if name == "llm" else 0.97,
                             f"Running {name} tests at the fixed commit...")
                h, h_out = await asyncio.to_thread(run_pytest, head_files, suite)
            r = region(b, h)
            verdicts[name] = {"base": b, "head": h, "region": r,
                              "base_out": b_out[-1500:], "head_out": h_out[-1500:]}
            yield _log("ok" if r in GOOD else "warn", "verify",
                       f"{name} tests: base exit={b} ({EXIT_MEANING.get(b, '?')})"
                       + (f"  head exit={h} ({EXIT_MEANING.get(h, '?')})" if h is not None else "")
                       + f"  ->  {r}")
            if r == "did not run":
                for line in (b_out if b not in (0, 1) else h_out).strip().splitlines()[-6:]:
                    yield _log("warn", "verify", "  " + line)

        out_dir = write_tests(owner, repo, tests) if req.write_output and tests else None
        if out_dir:
            yield _log("ok", "write", f"Wrote test files to {out_dir}")

        yield {"type": "result", "tests": tests_as_dicts(tests),
               "human_tests": tests_as_dicts(human), "raw": text, "stats": stats,
               "out_dir": out_dir, "repo": f"{owner}/{repo}",
               "issue": {"number": n, "title": issue["title"], "state": issue["state"],
                         "url": issue["html_url"], "pr": pr, "base": buggy, "head": fixed},
               "verdicts": verdicts}
        yield _stage("done", 1.0, "Complete.")
        yield {"type": "done"}

    except Exception as exc:  # surface any failure to the UI, then end cleanly
        yield {"type": "error", "message": str(exc)}
        yield {"type": "done"}


def _demo() -> None:
    """Self-check:  python -m backend.pipeline.issues"""
    assert region(1, 0) == "caught the bug"
    assert region(0, 0) == "redundant"
    assert region(1, 1) == "fails at both"
    assert region(0, 1) == "contradicts the fix"
    assert region(2, 0) == "did not run" and region(0, -1) == "did not run"
    assert region(1, None) == "fails at base (as it should)"
    assert region(5, None) == "did not run"
    fix, tests = split_pr_files([{"filename": "pkg/core.py", "status": "modified"},
                                 {"filename": "tests/test_core.py", "status": "added"},
                                 {"filename": "pkg/old.py", "status": "removed"}])
    assert fix == ["pkg/core.py"] and tests == ["tests/test_core.py"], (fix, tests)
    files = {"pkg/parser.py": b"", "pkg/__init__.py": b"", "pkg/io.py": b"",
             "pkg/more.py": b"def split_before(it):\n    pass\n",
             "tests/test_more.py": b"def split_before():\n    pass\n", "README.md": b""}
    assert mentioned_files(files, 'File "/x/pkg/parser.py", line 3') == ["pkg/parser.py"]
    assert mentioned_files(files, "split_before drops items") == ["pkg/more.py"]
    assert mentioned_files(files, "nothing here") == []
    print("issues self-check OK")


if __name__ == "__main__":
    _demo()
