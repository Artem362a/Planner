from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from mcp_auth import MCP_RESOURCE_URL
from observability import setup_observability
from mcp_server import mcp, mcp_http_app
from rate_limit import limiter
from routers import auth_routes, categories, day, experimental, feedback, goals, inbox, legal, mcp_oauth, notes, notifications, schedule, statistics, telegram, templates, week
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

load_dotenv()


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Mounted ASGI apps do not run their own lifespan. The MCP session manager
    # therefore belongs to the parent FastAPI application's lifespan.
    async with mcp.session_manager.run():
        yield


app = FastAPI(lifespan=lifespan)
setup_observability(app)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
UPLOADS_DIR = Path(__file__).resolve().parent / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Mcp-Session-Id"],
)

app.include_router(auth_routes.router)
app.include_router(notifications.router)
app.include_router(goals.router)
app.include_router(feedback.router)
app.include_router(categories.router)
app.include_router(legal.router)
app.include_router(day.router)
app.include_router(notes.router)
app.include_router(inbox.router)
app.include_router(templates.router)
app.include_router(week.router)
app.include_router(statistics.router)
app.include_router(telegram.router)
app.include_router(schedule.router)
app.include_router(experimental.router)
app.include_router(mcp_oauth.router)


@app.api_route(
    "/mcp",
    methods=["GET", "HEAD", "POST", "DELETE", "OPTIONS"],
    include_in_schema=False,
)
async def redirect_to_canonical_mcp_resource():
    """Preserve the HTTP method while canonicalizing the Streamable HTTP URL."""
    return RedirectResponse(MCP_RESOURCE_URL, status_code=308)


app.mount("/mcp", mcp_http_app, name="mcp")
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
