"""
Add `dismissed` column to planning.day_tasks.

Dismissed tasks remain in the DB for statistics but are hidden from the
overdue-tasks list. Idempotent — skips if the column already exists.

Usage:
    python migrations/2026_05_17_add_dismissed_to_day_tasks.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")


def main() -> int:
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL is not set in .env", file=sys.stderr)
        return 2

    engine = create_engine(db_url)

    with engine.begin() as conn:
        exists = conn.execute(
            text(
                """
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'planning'
                  AND table_name   = 'day_tasks'
                  AND column_name  = 'dismissed'
                """
            )
        ).first()

        if exists:
            print("Column planning.day_tasks.dismissed already exists — nothing to do.")
            return 0

        conn.execute(
            text(
                "ALTER TABLE planning.day_tasks "
                "ADD COLUMN dismissed BOOLEAN NOT NULL DEFAULT FALSE"
            )
        )
        print("Added column planning.day_tasks.dismissed (BOOLEAN NOT NULL DEFAULT FALSE)")

    print("Migration complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
