"""FastAPI backend for UK Rail History.

Scrapes realtimetrains.co.uk using the user's browser cookie (RTT+ subscription)
and stores confirmed journey records in SQLite.
"""

from __future__ import annotations

import os
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import bcrypt
import jwt as pyjwt
import requests
from bs4 import BeautifulSoup
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import Annotated
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.db import get_db_path, init_db, load_local_env

ROOT_DIR = Path(__file__).resolve().parents[1]
RTT_WEB = "https://www.realtimetrains.co.uk"

load_local_env()

DB_PATH = get_db_path()
_jwt_secret = os.getenv("JWT_SECRET", "")
if not _jwt_secret:
    raise RuntimeError("JWT_SECRET environment variable must be set before starting the server")
JWT_SECRET: str = _jwt_secret
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 30

_http_bearer_optional = HTTPBearer(auto_error=False)


# ── Auth ──────────────────────────────────────────────────────────────────────

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_http_bearer_optional),
) -> int:
    if not credentials:
        raise HTTPException(status_code=401, detail="Authorization required")
    try:
        payload = pyjwt.decode(
            credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM]
        )
        return int(payload["sub"])
    except (pyjwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_http_bearer_optional),
) -> Optional[int]:
    if not credentials:
        return None
    try:
        payload = pyjwt.decode(
            credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM]
        )
        return int(payload["sub"])
    except (pyjwt.InvalidTokenError, KeyError, ValueError):
        return None


# ── Request models ────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str = Field(..., pattern=r"^[A-Za-z][A-Za-z0-9]+$")
    password: str


class SearchRequest(BaseModel):
    travelDate: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    originCrs: str = Field(..., min_length=2, max_length=8)
    destinationCrs: str = Field(..., min_length=2, max_length=8)
    time: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    windowMinutes: int = Field(default=10, ge=8, le=180)


class ResolveRequest(BaseModel):
    travelDate: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    originCrs: str = Field(..., min_length=2, max_length=8)
    destinationCrs: str = Field(..., min_length=2, max_length=8)
    identity: str = Field(..., min_length=2)
    departureDate: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    save: bool = False
    direction: Optional[str] = None
    reason: Optional[str] = None
    detailedReason: Optional[str] = None


class UpdateJourneyRequest(BaseModel):
    direction: Optional[str] = None
    reason: Optional[str] = None
    detailed_reason: Optional[str] = None


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="UK Rail History API", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    init_db(DB_PATH)


# ── RTT website scraping ──────────────────────────────────────────────────────

def get_rtt_cookie(x_rtt_cookie: Annotated[Optional[str], Header()] = None) -> str:
    cookie = (x_rtt_cookie or "").strip()
    if not cookie:
        raise HTTPException(status_code=401, detail="No RTT cookie provided. Enter your RTT website cookie in the app.")
    return cookie


def web_get(url: str, cookie: str) -> BeautifulSoup:
    try:
        r = requests.get(url, headers={"Cookie": cookie, "User-Agent": "Mozilla/5.0"}, timeout=15)
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"RTT request failed: {exc}") from exc
    if not r.ok:
        raise HTTPException(status_code=502, detail=f"RTT returned HTTP {r.status_code}")
    return BeautifulSoup(r.text, "html.parser")


def parse_t4(raw: str | None) -> str | None:
    """'HH:MM' or 'HHMM' → 'HHMM'; strips +1 suffix; None if unparseable."""
    if not raw:
        return None
    s = raw.strip()
    if s.endswith("+1"):
        s = s[:-2].strip()
    s = s.replace(":", "")
    return s if len(s) == 4 and s.isdigit() else None


def t4_mins(t4: str | None) -> int | None:
    if t4 and len(t4) == 4 and t4.isdigit():
        return int(t4[:2]) * 60 + int(t4[2:])
    return None


def t4_to_iso(date_str: str, t4: str | None, next_day: bool = False) -> str | None:
    if not t4:
        return None
    d = date.fromisoformat(date_str)
    if next_day:
        d += timedelta(days=1)
    return f"{d}T{t4[:2]}:{t4[2:]}:00"


def parse_delay(el: Any) -> int | None:
    """Parse div.realtime.delay: '+1'→1, '-2'→-2, ''→None."""
    if not el:
        return None
    txt = el.get_text(strip=True)
    if not txt:
        return None
    try:
        return int(txt)
    except ValueError:
        return None


def diff_mins(rt: str | None, plan: str | None) -> int | None:
    r, p = t4_mins(rt), t4_mins(plan)
    if r is None or p is None:
        return None
    d = r - p
    if d > 720:
        d -= 1440
    if d < -720:
        d += 1440
    return d


def scrape_service_page(
    uid: str, dep_date: str, origin_crs: str, dest_crs: str, cookie: str
) -> dict[str, Any]:
    svc_url = f"{RTT_WEB}/service/gb-nr:{uid}/{dep_date}"
    soup = web_get(svc_url, cookie)

    if soup.select_one('form[action*="login"]'):
        raise HTTPException(status_code=401, detail="RTT cookie expired or invalid.")

    # Operator
    operator = ""
    toc_el = soup.select_one("div.toc")
    if toc_el:
        first_div = toc_el.select_one("div")
        if first_div:
            operator = first_div.get_text(strip=True)

    # Stops
    stops = []
    for div in soup.select("div.location.call.public"):
        crs_el   = div.select_one("span.crs")
        plat_el  = div.select_one("div.platform")
        garr_el  = div.select_one("div.gbtt.arr")
        gdep_el  = div.select_one("div.gbtt.dep")
        rarr_el  = div.select_one("div.realtime.arr")
        rdep_el  = div.select_one("div.realtime.dep")
        delay_el = div.select_one("div.realtime.delay")

        crs = crs_el.get_text(strip=True) if crs_el else None
        rt_arr_txt = (rarr_el.get_text(strip=True) if rarr_el else "") or ""
        rt_dep_txt = (rdep_el.get_text(strip=True) if rdep_el else "") or ""
        stops.append({
            "crs":         crs,
            "platform":    plat_el.get_text(strip=True) if plat_el else None,
            "planned_arr": parse_t4(garr_el.get_text(strip=True) if garr_el else None),
            "planned_dep": parse_t4(gdep_el.get_text(strip=True) if gdep_el else None),
            "rt_arr":      rt_arr_txt if (len(rt_arr_txt) == 4 and rt_arr_txt.isdigit()) else None,
            "rt_dep":      rt_dep_txt if (len(rt_dep_txt) == 4 and rt_dep_txt.isdigit()) else None,
            "delay":       parse_delay(delay_el),
        })

    if not stops:
        raise HTTPException(status_code=422, detail="No stops found on service page.")

    origin_up = origin_crs.upper()
    dest_up   = dest_crs.upper()

    boarding_idx = next((i for i, s in enumerate(stops) if s["crs"] == origin_up), None)
    if boarding_idx is None:
        available = [s["crs"] for s in stops if s["crs"]]
        raise HTTPException(status_code=422, detail={"message": "Service does not call at origin.", "availableStops": available})

    # On loop/circular routes the destination may appear both before and after the boarding
    # stop. Prefer the occurrence AFTER boarding; fall back to any occurrence.
    alighting_idx = next(
        (i for i, s in enumerate(stops) if s["crs"] == dest_up and i > boarding_idx),
        next((i for i, s in enumerate(stops) if s["crs"] == dest_up), None),
    )
    if alighting_idx is None:
        available = [s["crs"] for s in stops if s["crs"]]
        raise HTTPException(status_code=422, detail={"message": "Service does not call at destination.", "availableStops": available})

    boarding  = stops[boarding_idx]
    alighting = stops[alighting_idx]

    dep_t4 = boarding["planned_dep"]
    arr_t4 = alighting["planned_arr"]
    dep_m, arr_m = t4_mins(dep_t4), t4_mins(arr_t4)
    next_day = dep_m is not None and arr_m is not None and arr_m < dep_m

    dep_delay = boarding.get("delay")
    if dep_delay is None:
        dep_delay = diff_mins(boarding.get("rt_dep"), boarding.get("planned_dep"))
    arr_delay = diff_mins(alighting.get("rt_arr"), alighting.get("planned_arr"))

    return {
        "identity":                 uid,
        "departureDate":            dep_date,
        "url":                      svc_url,
        "operatorName":             operator,
        "serviceOriginCrs":         stops[0]["crs"],
        "serviceDestinationCrs":    stops[-1]["crs"],
        "boarded":                  {"crs": origin_crs.upper(), "name": origin_crs.upper()},
        "alighted":                 {"crs": dest_crs.upper(),   "name": dest_crs.upper()},
        "plannedDeparture":         t4_to_iso(dep_date, dep_t4),
        "plannedArrival":           t4_to_iso(dep_date, arr_t4, next_day),
        "departureLatenessMinutes": dep_delay,
        "arrivalLatenessMinutes":   arr_delay,
        "platformDeparture":        boarding.get("platform"),
        "platformArrival":          alighting.get("platform"),
        "isCancelled":              False,
    }


# ── DB helpers ────────────────────────────────────────────────────────────────

def save_journey(
    detail: dict[str, Any],
    direction: Optional[str],
    reason: Optional[str],
    detailed_reason: Optional[str],
    user_id: int,
) -> int:
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.execute(
            """
            INSERT INTO journeys (
                user_id,
                travel_date, boarded_crs, alighted_crs, departure_date,
                operator_name,
                service_origin_crs, service_destination_crs,
                planned_departure, departure_lateness_minutes,
                planned_arrival,   arrival_lateness_minutes,
                platform_departure, platform_arrival,
                direction, reason, detailed_reason, url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                detail.get("travelDate"),
                detail["boarded"]["crs"],
                detail["alighted"]["crs"],
                detail.get("departureDate"),
                detail.get("operatorName"),
                detail.get("serviceOriginCrs"),
                detail.get("serviceDestinationCrs"),
                detail.get("plannedDeparture"),
                detail.get("departureLatenessMinutes"),
                detail.get("plannedArrival"),
                detail.get("arrivalLatenessMinutes"),
                detail.get("platformDeparture"),
                detail.get("platformArrival"),
                direction,
                reason,
                detailed_reason,
                detail.get("url"),
            ),
        )
        conn.commit()
        return int(cursor.lastrowid)


# ── API endpoints ─────────────────────────────────────────────────────────────

@app.post("/api/auth/login")
def login(body: LoginRequest) -> dict[str, Any]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT id, password_hash FROM users WHERE username = ?", (body.username,)
        ).fetchone()
    try:
        password_ok = row and bcrypt.checkpw(body.password.encode(), row["password_hash"].encode())
    except ValueError:
        password_ok = False
    if not password_ok:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    expire = datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS)
    token = pyjwt.encode(
        {"sub": str(row["id"]), "exp": expire}, JWT_SECRET, algorithm=JWT_ALGORITHM
    )
    return {"token": token}


@app.get("/api/stations-local")
def stations_local() -> dict[str, Any]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT crs, name, lat, long FROM stations ORDER BY name").fetchall()
    return {"stations": [dict(r) for r in rows]}


@app.post("/api/search-services")
def search_services(
    request: SearchRequest,
    _: int = Depends(get_current_user),
    cookie: str = Depends(get_rtt_cookie),
) -> dict[str, Any]:
    time4 = request.time.replace(":", "")
    search_url = (
        f"{RTT_WEB}/search/simple"
        f"/gb-nr:{request.originCrs.upper()}/to/gb-nr:{request.destinationCrs.upper()}"
        f"/{request.travelDate}/{time4}"
    )
    soup = web_get(search_url, cookie)
    page_text = soup.get_text()

    if soup.select_one('form[action*="login"]'):
        raise HTTPException(status_code=401, detail="RTT cookie expired or invalid.")
    if "historical search horizon" in page_text:
        raise HTTPException(status_code=403, detail="This date is beyond RTT's historical search horizon.")

    req_mins = int(request.time[:2]) * 60 + int(request.time[3:])
    raw_candidates: list[dict[str, Any]] = []
    for a in soup.select('a.service[href*="/service/gb-nr:"]'):
        parts = a["href"].lstrip("/").split("/")
        uid      = parts[1].replace("gb-nr:", "")
        dep_date = parts[2].split("#")[0]
        time_el  = a.select_one("div.time")
        t4_text  = time_el.get_text(strip=True) if time_el else ""
        if not (t4_text and t4_text.isdigit() and len(t4_text) == 4):
            continue
        if abs(int(t4_text[:2]) * 60 + int(t4_text[2:]) - req_mins) > request.windowMinutes:
            continue
        raw_candidates.append({"uid": uid, "dep_date": dep_date, "dep_t4": t4_text})

    def enrich(c: dict[str, Any]) -> dict[str, Any] | None:
        try:
            return scrape_service_page(c["uid"], c["dep_date"], request.originCrs, request.destinationCrs, cookie)
        except HTTPException:
            return None

    candidates: list[dict[str, Any]] = []
    if raw_candidates:
        with ThreadPoolExecutor(max_workers=min(6, len(raw_candidates))) as executor:
            for result in executor.map(enrich, raw_candidates):
                if result:
                    candidates.append(result)

    candidates.sort(key=lambda c: c.get("plannedDeparture") or "")
    return {
        "query": request.model_dump(),
        "candidateCount": len(candidates),
        "candidates": candidates,
    }


@app.post("/api/resolve-service")
def resolve_service(
    request: ResolveRequest,
    user_id: int = Depends(get_current_user),
    cookie: str = Depends(get_rtt_cookie),
) -> dict[str, Any]:
    detail = scrape_service_page(
        request.identity,
        request.departureDate,
        request.originCrs,
        request.destinationCrs,
        cookie,
    )
    detail["travelDate"] = request.travelDate

    saved_id: int | None = None
    if request.save:
        saved_id = save_journey(detail, request.direction, request.reason, request.detailedReason, user_id)
    return {"journeyId": saved_id, "detail": detail}


@app.patch("/api/journeys/{journey_id}")
def update_journey(
    journey_id: int,
    body: UpdateJourneyRequest,
    user_id: int = Depends(get_current_user),
) -> dict[str, Any]:
    with sqlite3.connect(DB_PATH) as conn:
        result = conn.execute(
            "UPDATE journeys SET direction = ?, reason = ?, detailed_reason = ? WHERE id = ? AND user_id = ?",
            (body.direction, body.reason, body.detailed_reason, journey_id, user_id),
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Journey not found")
        conn.commit()
    return {"updated": journey_id}


@app.delete("/api/journeys/{journey_id}")
def delete_journey(
    journey_id: int,
    user_id: int = Depends(get_current_user),
) -> dict[str, Any]:
    with sqlite3.connect(DB_PATH) as conn:
        result = conn.execute(
            "DELETE FROM journeys WHERE id = ? AND user_id = ?", (journey_id, user_id)
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Journey not found")
    return {"deleted": journey_id}


@app.get("/api/journeys")
def list_journeys(
    limit: int = Query(default=20, ge=1, le=800),
    username: str = Query(..., pattern=r"^[A-Za-z][A-Za-z0-9]+$"),
    requesting_user_id: Optional[int] = Depends(get_optional_user),
) -> dict[str, Any]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        user = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail=f"User '{username}' not found")
        is_owner = requesting_user_id is not None and requesting_user_id == user["id"]
        rows = conn.execute(
            """
            SELECT j.id, j.travel_date, j.boarded_crs, j.alighted_crs,
                   j.departure_date, j.operator_name,
                   j.service_origin_crs, j.service_destination_crs, j.planned_departure,
                   j.departure_lateness_minutes, j.planned_arrival,
                   j.arrival_lateness_minutes, j.platform_departure,
                   j.platform_arrival, j.direction, j.reason, j.detailed_reason, j.url, j.created_at
            FROM journeys j
            JOIN users u ON j.user_id = u.id
            WHERE u.username = ?
            ORDER BY j.travel_date DESC, j.id DESC
            LIMIT ?
            """,
            (username, limit),
        ).fetchall()
    personal = {"direction", "reason", "detailed_reason"}
    journeys = [
        {k: v for k, v in dict(row).items() if is_owner or k not in personal}
        for row in rows
    ]
    return {"journeys": journeys}
