from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from observability import setup_observability
from rate_limit import limiter
from routers import auth_routes, categories, day, feedback, goals, inbox, legal, notes, notifications, statistics, telegram, templates, week
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

load_dotenv()

app = FastAPI()
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
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
