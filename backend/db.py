"""Shared database initialisation for main.py and create_user.py."""

from __future__ import annotations

import csv
import os
import sqlite3
from pathlib import Path

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


def get_db_path() -> Path:
    configured = os.getenv("RAIL_HISTORY_SQLITE_PATH")
    if configured:
        return Path(configured)
    return ROOT_DIR / "rail_history.sqlite3"


def init_db(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                username      TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS stations (
                crs  TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                lat  REAL,
                long REAL
            )
            """
        )
        csv_path = ROOT_DIR / "data" / "crs.csv"
        if csv_path.exists():
            with open(csv_path, newline="", encoding="utf-8") as f:
                conn.executemany(
                    "INSERT OR REPLACE INTO stations (crs, name, lat, long) VALUES (?, ?, ?, ?)",
                    (
                        (r["crs"], r["name"], float(r["lat"]) if r.get("lat") else None, float(r["long"]) if r.get("long") else None)
                        for r in csv.DictReader(f) if r.get("crs")
                    ),
                )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS journeys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER REFERENCES users(id),
                travel_date TEXT NOT NULL,
                boarded_crs TEXT NOT NULL,
                alighted_crs TEXT NOT NULL,
                departure_date TEXT NOT NULL,
                operator_name TEXT,
                service_origin_crs TEXT,
                service_destination_crs TEXT,
                planned_departure TEXT,
                departure_lateness_minutes INTEGER,
                planned_arrival TEXT,
                arrival_lateness_minutes INTEGER,
                platform_departure TEXT,
                platform_arrival TEXT,
                direction TEXT,
                reason TEXT,
                detailed_reason TEXT,
                url TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_journeys_user_id ON journeys(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_journeys_user_travel ON journeys(user_id, travel_date DESC)")
        conn.commit()
