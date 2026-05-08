"""
Migrate all data from old SQLite planner.db to PostgreSQL.
Safe to run multiple times — clears PG tables before inserting.
"""
from __future__ import annotations

import json
import sqlite3
import sys
import os

sys.path.insert(0, r"c:\Users\Liza\PycharmProjects\Day_plan\planner\backend")

import psycopg2
from psycopg2.extras import execute_values
from sqlalchemy import Boolean, inspect as sa_inspect
from sqlalchemy import create_engine

SQLITE_PATH = r"C:\Users\Liza\project backup\7.05\Day_plan\planner\backend\planner.db"
PG_DSN = "postgresql://dayplan_user:dayplan_pass@localhost:5432/dayplan"

TABLE_ORDER = [
    "users",
    "notifications",
    "notification_recipients",
    "goals",
    "goal_stages",
    "goal_checkins",
    "task_categories",
    "day_templates",
    "week_templates",
    "week_tasks",
    "day_settings",
    "day_tasks",
    "feedback_messages",
]


def get_bool_columns(pg_engine) -> dict[str, set[str]]:
    """Return {table: {bool_col_names}} using PG schema inspection."""
    inspector = sa_inspect(pg_engine)
    result: dict[str, set[str]] = {}
    for table in TABLE_ORDER:
        try:
            cols = inspector.get_columns(table)
            result[table] = {c["name"] for c in cols if isinstance(c["type"], Boolean)}
        except Exception:
            result[table] = set()
    return result


def sqlite_rows(conn: sqlite3.Connection, table: str) -> tuple[list[str], list[tuple]]:
    cur = conn.cursor()
    cur.execute(f'PRAGMA table_info("{table}")')
    cols = [row[1] for row in cur.fetchall()]
    cur.execute(f'SELECT * FROM "{table}"')
    return cols, cur.fetchall()


def convert_row(row: tuple, cols: list[str], bool_cols: set[str]) -> tuple:
    new_row = []
    for col, val in zip(cols, row):
        if col in bool_cols:
            # SQLite stores booleans as 0/1
            val = bool(val) if val is not None else None
        elif isinstance(val, (dict, list)):
            val = json.dumps(val, ensure_ascii=False)
        elif isinstance(val, str):
            stripped = val.strip()
            if stripped.startswith(("[", "{")):
                try:
                    json.loads(stripped)  # validate it's valid JSON, keep as string
                except json.JSONDecodeError:
                    pass
        new_row.append(val)
    return tuple(new_row)


def main() -> None:
    sq = sqlite3.connect(SQLITE_PATH)
    pg_engine = create_engine(PG_DSN)
    bool_cols_map = get_bool_columns(pg_engine)
    pg_engine.dispose()

    pg = psycopg2.connect(PG_DSN)
    pg.autocommit = False
    pg_cur = pg.cursor()

    # Truncate in reverse FK order
    for table in reversed(TABLE_ORDER):
        pg_cur.execute(f'TRUNCATE TABLE "{table}" CASCADE')
    print("Cleared all tables.")

    # Insert in FK order
    for table in TABLE_ORDER:
        sq_cur = sq.cursor()
        sq_cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
        )
        if not sq_cur.fetchone():
            print(f"  skip {table} (not in old DB)")
            continue

        cols, rows = sqlite_rows(sq, table)

        if not rows:
            print(f"  {table}: 0 rows")
            continue

        bool_cols = bool_cols_map.get(table, set())
        col_list = ", ".join(f'"{c}"' for c in cols)
        placeholders = ", ".join(["%s"] * len(cols))
        converted = [convert_row(r, cols, bool_cols) for r in rows]

        execute_values(
            pg_cur,
            f'INSERT INTO "{table}" ({col_list}) VALUES %s',
            converted,
            template=f"({placeholders})",
        )
        print(f"  {table}: {len(rows)} rows")

    # Reset sequences
    for table in TABLE_ORDER:
        pg_cur.execute(f"""
            SELECT setval(
                pg_get_serial_sequence('"{table}"', 'id'),
                COALESCE((SELECT MAX(id) FROM "{table}"), 0) + 1,
                false
            )
        """)

    pg.commit()
    pg_cur.close()
    pg.close()
    sq.close()
    print("\nMigration complete.")


if __name__ == "__main__":
    main()
