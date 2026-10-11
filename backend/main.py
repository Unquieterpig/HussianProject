"""FastAPI app: provider metadata, the streaming generate endpoint, static UI."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from .config import public_presets
from .models import GenerateRequest
from .pipeline.issues import list_issues, run_issue_pipeline
from .pipeline.repo import parse_repo_url
from .pipeline.runner import run_pipeline
from .providers.discovery import list_models

app = FastAPI(title="TESTFORGE", version="0.1.0")

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@app.middleware("http")
async def revalidate(request, call_next):
    """Browsers otherwise keep serving a stale app.js/style.css after an edit."""
    resp = await call_next(request)
    resp.headers.setdefault("Cache-Control", "no-cache")
    return resp


@app.get("/api/providers")
async def providers() -> list[dict]:
    """Provider presets (no secrets) for populating the UI."""
    return public_presets()


@app.get("/api/models")
async def models(provider: str) -> list[str]:
    """Live model list for a provider (newest first), via its API + .env key."""
    return await list_models(provider)


@app.get("/api/issues")
async def issues(repo: str, state: str = "all", page: int = 1) -> list[dict]:
    """A repo's issues (open + closed, no PRs), newest first, for the picker."""
    if state not in ("open", "closed", "all"):
        raise HTTPException(400, "state must be open, closed or all")
    try:
        owner, name, _ = parse_repo_url(repo)
        return await list_issues(owner, name, state, page)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(400, str(exc))


@app.post("/api/generate")
async def generate(req: GenerateRequest) -> StreamingResponse:
    """Run the pipeline, streaming newline-delimited JSON events."""
    pipeline = run_issue_pipeline if req.issue else run_pipeline

    async def event_stream():
        async for event in pipeline(req):
            yield json.dumps(event) + "\n"

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# Serve the frontend at the root. Registered last so /api/* takes precedence.
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
