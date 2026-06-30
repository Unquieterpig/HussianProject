"""Fetch a public GitHub repo as a zip archive (no local git required).

Using the GitHub zipball endpoint keeps the app dependency-free of a git binary
and works for any public repo. A GITHUB_TOKEN simply raises the rate limit.
"""

from __future__ import annotations

import io
import zipfile
from typing import Dict, Optional, Tuple

import httpx


def parse_repo_url(raw: str) -> Tuple[str, str, Optional[str]]:
    """Parse owner/repo (+ optional ref) from a URL or shorthand.

    Accepts:
      - https://github.com/owner/repo
      - https://github.com/owner/repo.git
      - https://github.com/owner/repo/tree/<ref>[/path...]
      - owner/repo
    """
    text = raw.strip().rstrip("/")
    if not text:
        raise ValueError("No repository given.")

    if "github.com/" in text:
        path = text.split("github.com/", 1)[1]
    else:
        path = text

    parts = [p for p in path.split("/") if p]
    if len(parts) < 2:
        raise ValueError(
            "Could not read a GitHub owner/repo from input. "
            "Try 'owner/repo' or a full github.com URL."
        )

    owner = parts[0]
    repo = parts[1]
    if repo.endswith(".git"):
        repo = repo[: -len(".git")]

    ref: Optional[str] = None
    if len(parts) >= 4 and parts[2] in ("tree", "commit", "blob"):
        ref = parts[3]

    return owner, repo, ref


async def download_repo_zip(
    owner: str,
    repo: str,
    ref: Optional[str] = None,
    token: Optional[str] = None,
) -> bytes:
    base = f"https://api.github.com/repos/{owner}/{repo}/zipball"
    url = f"{base}/{ref}" if ref else base
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "testforge",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    async with httpx.AsyncClient(follow_redirects=True, timeout=120.0) as client:
        resp = await client.get(url, headers=headers)
        if resp.status_code == 404:
            raise RuntimeError(
                f"Repository '{owner}/{repo}'"
                + (f"@{ref}" if ref else "")
                + " not found (is it public and spelled correctly?)."
            )
        if resp.status_code == 403:
            raise RuntimeError(
                "GitHub rate limit hit. Add a GITHUB_TOKEN to .env to raise it."
            )
        if resp.status_code != 200:
            raise RuntimeError(
                f"GitHub download failed (HTTP {resp.status_code})."
            )
        return resp.content


def extract_zip(data: bytes) -> Dict[str, bytes]:
    """Return {relative_path: file_bytes}, stripping the archive's root folder."""
    files: Dict[str, bytes] = {}
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            name = info.filename
            # GitHub archives nest everything under "owner-repo-<sha>/".
            if "/" in name:
                name = name.split("/", 1)[1]
            if not name:
                continue
            files[name] = zf.read(info)
    return files
