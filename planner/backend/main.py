from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from bootstrap import (
    ensure_feedback_screenshots_column,
    ensure_goal_columns,
    ensure_goal_stage_columns,
    ensure_schemas,
    ensure_task_category_icon_column,
    ensure_user_avatar_column,
    ensure_user_theme_column,
)
from db import Base, engine
from routers import auth_routes, categories, day, feedback, goals, inbox, legal, notifications, statistics, templates, week

load_dotenv()

app = FastAPI()
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
UPLOADS_DIR = Path(__file__).resolve().parent / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

ensure_schemas()
Base.metadata.create_all(bind=engine)
ensure_task_category_icon_column()
ensure_user_avatar_column()
ensure_user_theme_column()
ensure_goal_columns()
ensure_goal_stage_columns()
ensure_feedback_screenshots_column()

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
app.include_router(inbox.router)
app.include_router(templates.router)
app.include_router(week.router)
app.include_router(statistics.router)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
