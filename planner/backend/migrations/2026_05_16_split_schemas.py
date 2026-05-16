"""
One-shot migration: split tables in `public` into 5 domain schemas.

  auth          -> users
  planning      -> day_tasks, day_settings, day_templates,
                   week_tasks, week_templates,
                   task_categories, inbox_tasks
  goals         -> goals, goal_stages, goal_checkins
  notifications -> notifications, notification_recipients
  feedback      -> feedback_messages

Idempotent — tables already in the target schema are skipped.
Uses ALTER TABLE … SET SCHEMA which is a metadata-only operation (no data copy).
Snapshots row counts before moving and verifies they match after.

Usage:
    python migrations/2026_05_16_split_schemas.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

SCHEMA_MAP: dict[str, list[str]] = {
    "auth": ["users"],
    "planning": [
        "day_tasks",
        "day_settings",
        "day_templates",
        "week_tasks",
        "week_templates",
        "task_categories",
        "inbox_tasks",
    ],
    "goals": ["goals", "goal_stages", "goal_checkins"],
    "notifications": ["notifications", "notification_recipients"],
    "feedback": ["feedback_messages"],
}


def main() -> int:
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL is not set in .env", file=sys.stderr)
        return 2

    engine = create_engine(db_url)

    with engine.begin() as conn:
        print("== Step 1: create schemas if missing ==")
        for schema in SCHEMA_MAP:
            conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
            print(f"  [ok] schema {schema}")

        print()
        print("== Step 2: snapshot current locations and row counts ==")
        current_locations: dict[str, str] = {}
        before_counts: dict[str, int] = {}
        for schema, tables in SCHEMA_MAP.items():
            for table in tables:
                row = conn.execute(
                    text(
                        "SELECT table_schema FROM information_schema.tables "
                        "WHERE table_name = :t"
                    ),
                    {"t": table},
                ).first()
                current_schema = row[0] if row else "<missing>"
                current_locations[table] = current_schema
                if current_schema != "<missing>":
                    count = conn.execute(
                        text(f'SELECT COUNT(*) FROM "{current_schema}"."{table}"')
                    ).scalar()
                    before_counts[table] = count
                else:
                    before_counts[table] = 0
                print(f"  {table:30s}  schema: {current_schema:15s}  rows: {before_counts[table]}")

        print()
        print("== Step 3: move tables ==")
        moved = 0
        for schema, tables in SCHEMA_MAP.items():
            for table in tables:
                current = current_locations[table]
                if current == "<missing>":
                    print(f"  [skip] {table}: not found in DB")
                    continue
                if current == schema:
                    print(f"  [skip] {table}: already in '{schema}'")
                    continue
                if current != "public":
                    print(
                        f"  [WARN] {table}: in unexpected schema '{current}', "
                        f"expected 'public' or '{schema}'. Skipping."
                    )
                    continue
                conn.execute(
                    text(f'ALTER TABLE "public"."{table}" SET SCHEMA "{schema}"')
                )
                print(f"  [moved] {table}: public -> {schema}")
                moved += 1
        print(f"  tables moved: {moved}")

        print()
        print("== Step 4: move owned sequences left in public ==")
        seq_rows = conn.execute(
            text(
                """
                SELECT c.relname AS seq_name,
                       t_n.nspname AS target_schema
                FROM pg_class c
                JOIN pg_namespace n   ON n.oid = c.relnamespace
                JOIN pg_depend d      ON d.objid = c.oid AND d.classid = 'pg_class'::regclass
                JOIN pg_class t       ON t.oid = d.refobjid
                JOIN pg_namespace t_n ON t_n.oid = t.relnamespace
                WHERE c.relkind = 'S'
                  AND d.deptype = 'a'
                  AND n.nspname = 'public'
                  AND t_n.nspname <> 'public'
                """
            )
        ).fetchall()

        for seq_name, target_schema in seq_rows:
            conn.execute(
                text(
                    f'ALTER SEQUENCE "public"."{seq_name}" SET SCHEMA "{target_schema}"'
                )
            )
            print(f"  [moved] sequence {seq_name}: public -> {target_schema}")
        if not seq_rows:
            print("  (no sequences to move)")

        print()
        print("== Step 5: verify row counts ==")
        all_ok = True
        for schema, tables in SCHEMA_MAP.items():
            for table in tables:
                if current_locations[table] == "<missing>":
                    print(f"  [skip] {schema}.{table}: table not in DB")
                    continue
                actual = conn.execute(
                    text(f'SELECT COUNT(*) FROM "{schema}"."{table}"')
                ).scalar()
                expected = before_counts[table]
                if actual == expected:
                    print(f"  [ok]   {schema}.{table:30s}  rows: {actual}")
                else:
                    print(f"  [FAIL] {schema}.{table:30s}  rows: {actual}  expected: {expected}")
                    all_ok = False

        if not all_ok:
            raise RuntimeError(
                "Row count mismatch after migration. Transaction will roll back."
            )

    print()
    print("Migration complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
