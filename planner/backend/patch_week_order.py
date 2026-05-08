import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "planner.db"


def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    columns = cur.execute("PRAGMA table_info(goal_stages)").fetchall()
    column_names = {row[1] for row in columns}

    if "planned_date" in column_names:
        print("Колонка planned_date уже существует")
        conn.close()
        return

    cur.execute("ALTER TABLE goal_stages ADD COLUMN planned_date DATE")
    conn.commit()
    conn.close()

    print("Колонка planned_date успешно добавлена")


if __name__ == "__main__":
    main()