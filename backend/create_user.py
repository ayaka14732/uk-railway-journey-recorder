#!/usr/bin/env python3
"""Manually create a user. Registration is disabled in the API."""

import getpass
import os
import sqlite3
import sys
from pathlib import Path

import bcrypt

ROOT_DIR = Path(__file__).resolve().parents[1]


def load_local_env() -> None:
    env_file = ROOT_DIR / "backend" / ".env"
    if not env_file.exists():
        return
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def main() -> None:
    load_local_env()
    db_path = Path(os.getenv("RAIL_HISTORY_SQLITE_PATH", "") or ROOT_DIR / "rail_history.sqlite3")

    username = input("Username: ").strip()
    if not username:
        print("Username cannot be empty.")
        sys.exit(1)

    password = getpass.getpass("Password: ")
    if not password:
        print("Password cannot be empty.")
        sys.exit(1)

    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    with sqlite3.connect(db_path) as conn:
        try:
            conn.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (username, password_hash),
            )
            user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            updated = conn.execute(
                "UPDATE journeys SET user_id = ? WHERE user_id IS NULL",
                (user_id,),
            ).rowcount
            conn.commit()
        except sqlite3.IntegrityError:
            print(f"User '{username}' already exists.")
            sys.exit(1)

    print(f"Created user '{username}' (id={user_id})")
    if updated:
        print(f"Assigned {updated} existing journeys to this user.")


if __name__ == "__main__":
    main()
