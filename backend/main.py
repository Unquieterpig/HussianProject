"""FastAPI app: provider metadata, the streaming generate endpoint, static UI."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from .config import public_presets
from .models import GenerateRequest
from .pipeline.runner import run_pipeline
from .providers.discovery import list_models

app = FastAPI(title="TESTFORGE", version="0.1.0")

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@app.get("/api/providers")
async def providers() -> list[dict]:
    """Provider presets (no secrets) for populating the UI."""
    return public_presets()


@app.get("/api/models")
async def models(provider: str) -> list[str]:
    """Live model list for a provider (newest first), via its API + .env key."""
    return await list_models(provider)


@app.post("/api/generate")
async def generate(req: GenerateRequest) -> StreamingResponse:
    """Run the pipeline, streaming newline-delimited JSON events."""

    async def event_stream():
        async for event in run_pipeline(req):
            yield json.dumps(event) + "\n"

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# Serve the frontend at the root. Registered last so /api/* takes precedence.
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
