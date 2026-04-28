import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.main import DB_PATH, init_db

init_db()
print(DB_PATH)
