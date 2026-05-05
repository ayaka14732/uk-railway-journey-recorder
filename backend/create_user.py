#!/usr/bin/env python3
"""Manually create a user. Registration is disabled in the API."""

import getpass
import sqlite3
import sys

import bcrypt

try:
    from backend.db import get_db_path, init_db, load_local_env
except ModuleNotFoundError:
    from db import get_db_path, init_db, load_local_env


def main() -> None:
    load_local_env()
    db_path = get_db_path()
    init_db(db_path)

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
