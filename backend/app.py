"""
Algae-Based Carbon Sequestration Monitoring Platform — API entrypoint.

Phase 0 stood this up as a health stub; Phases 2-3 mounted the real contract
routers (architecture.md §3); Phase 6 made the same process serve the built
frontend, so the deployed unit is one service on one origin.
"""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.routes import router as api_router

# Vite dev server origins — no auth/multi-tenant in scope, so a fixed
# dev allowlist is enough (PRD §5). In production nothing uses this: the SPA is
# served by this same process, so every /api call is same-origin by
# construction. That is the point of the single-service deploy — there is no
# cross-origin configuration left to get wrong on the host.
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app = FastAPI(
    title="Algae Carbon Sequestration Monitoring Platform",
    description="Cross-verifies simulated IoT sensor data against Sentinel-2 imagery indices.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.get("/health")
def health():
    """Liveness probe — also the Phase 0 placeholder endpoint.

    `render.yaml` points its health check here rather than at `/`, so a broken
    frontend build is reported as a broken frontend build instead of taking the
    whole service out of rotation.
    """
    return {"status": "ok", "service": "algae-carbon-api", "version": "0.1.0"}


def static_dir() -> Path | None:
    """Locate the built SPA, or None when only the API is being served.

    Three candidates, in order: `STATIC_DIR` for anyone who wants to say it
    outright, `backend/static/` which is where the Docker image lands the build,
    and `frontend/dist/` which is where a local `vite build` leaves it. The last
    one means the production shape can be run on this machine without Docker —
    which is exactly what the Phase 6 gate does.

    Returning None rather than raising is deliberate: the Phase 1-3 backend
    gates start this app with no frontend built at all, and an API-only process
    is a legitimate way to run it.
    """
    here = Path(__file__).resolve().parent
    explicit = os.environ.get("STATIC_DIR")
    candidates = ([Path(explicit)] if explicit else []) + [
        here / "static",
        here.parent / "frontend" / "dist",
    ]
    for candidate in candidates:
        if (candidate / "index.html").is_file():
            return candidate.resolve()
    return None


_static = static_dir()
if _static is not None:
    # Mounted last, so `/api/...` and `/health` are matched first and a mistyped
    # API path still answers with the API's JSON 404 rather than with HTML.
    #
    # No SPA catch-all is needed here: the frontend routes on the hash
    # (`/#/site/site-a`), so every deep link is `/` as far as this server is
    # concerned and survives a refresh without any rewrite rule. That was chosen
    # back in Phase 4 precisely so the deploy would not need one.
    app.mount("/", StaticFiles(directory=_static, html=True), name="spa")
