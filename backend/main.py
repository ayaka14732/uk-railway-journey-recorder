"""FastAPI backend for UK Rail History.

This service keeps the Realtime Trains token server-side, queries the RTT API through a
controlled proxy, normalises train timing data for the frontend, and stores confirmed
journey records in SQLite. It intentionally avoids exposing the bearer token to React.
"""

from __future__ import annotations

import json
import os
import sqlite3
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ROOT_DIR = Path(__file__).resolve().parents[1]


def load_local_env() -> None:
    """Small .env loader so local development does not require extra dependencies."""
    env_file = ROOT_DIR / "backend" / ".env"
    if not env_file.exists():
        return
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_local_env()

def sqlite_path_from_env() -> Path:
    configured = os.getenv("RAIL_HISTORY_SQLITE_PATH") or os.getenv("DATABASE_URL")
    if configured and not configured.startswith(("mysql:", "postgres:", "postgresql:")):
        if configured.startswith("sqlite:///"):
            return Path(configured.replace("sqlite:///", "", 1))
        return Path(configured)
    return ROOT_DIR / "rail_history.sqlite3"


DB_PATH = sqlite_path_from_env()
RTT_BASE_URL = os.getenv("RTT_BASE_URL", "https://data.rtt.io").rstrip("/")
RTT_API_VERSION = os.getenv("RTT_API_VERSION", "2026-04-09")
RTT_TOKEN = os.getenv("RTT_API_TOKEN", "").strip()
RTT_ACCESS_TOKEN_CACHE: Optional[str] = None

FALLBACK_STATIONS = [
    {"crs": "MKC", "name": "Milton Keynes Central", "longCode": "MILTONK"},
    {"crs": "EUS", "name": "London Euston", "longCode": "EUSTON"},
    {"crs": "BHM", "name": "Birmingham New Street", "longCode": "BHAMNWS"},
    {"crs": "MAN", "name": "Manchester Piccadilly", "longCode": "MNCRPIC"},
    {"crs": "GLC", "name": "Glasgow Central", "longCode": "GLGC"},
    {"crs": "CRE", "name": "Crewe", "longCode": "CREWE"},
    {"crs": "RUG", "name": "Rugby", "longCode": "RUGBY"},
    {"crs": "WFJ", "name": "Watford Junction", "longCode": "WATFDJ"},
]


class SearchRequest(BaseModel):
    travelDate: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    originCrs: str = Field(..., min_length=2, max_length=8)
    destinationCrs: str = Field(..., min_length=2, max_length=8)
    time: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    windowMinutes: int = Field(default=120, ge=15, le=360)


class ResolveRequest(BaseModel):
    travelDate: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    originCrs: str = Field(..., min_length=2, max_length=8)
    destinationCrs: str = Field(..., min_length=2, max_length=8)
    identity: str = Field(..., min_length=2)
    departureDate: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    save: bool = False


app = FastAPI(title="UK Rail History API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS journeys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                travel_date TEXT NOT NULL,
                boarded_crs TEXT NOT NULL,
                alighted_crs TEXT NOT NULL,
                service_identity TEXT NOT NULL,
                departure_date TEXT NOT NULL,
                operator_code TEXT,
                operator_name TEXT,
                train_reporting_identity TEXT,
                service_origin_name TEXT,
                service_destination_name TEXT,
                planned_departure TEXT,
                actual_departure TEXT,
                departure_lateness_minutes INTEGER,
                planned_arrival TEXT,
                actual_arrival TEXT,
                arrival_lateness_minutes INTEGER,
                platform_departure TEXT,
                platform_arrival TEXT,
                raw_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.commit()


@app.on_event("startup")
def startup() -> None:
    init_db()


def rtt_headers(token: Optional[str] = None) -> dict[str, str]:
    effective_token = token or RTT_ACCESS_TOKEN_CACHE or RTT_TOKEN
    if not effective_token:
        raise HTTPException(
            status_code=503,
            detail="RTT_API_TOKEN is not configured. Put your Realtime Trains bearer token in backend/.env or the process environment.",
        )
    return {
        "Authorization": f"Bearer {effective_token}",
        "Accept": "application/json",
        "RTT-Version": RTT_API_VERSION,
    }


def refresh_rtt_access_token() -> Optional[str]:
    """Exchange a long-life RTT refresh token for a short-life access token when needed."""
    global RTT_ACCESS_TOKEN_CACHE
    if not RTT_TOKEN:
        return None

    url = f"{RTT_BASE_URL}/api/get_access_token"
    try:
        response = requests.get(
            url,
            headers=rtt_headers(RTT_TOKEN),
            params={"version": RTT_API_VERSION},
            timeout=18,
        )
    except requests.RequestException:
        return None

    if not response.ok:
        return None

    payload = response.json()
    token = payload.get("token")
    if isinstance(token, str) and token.strip():
        RTT_ACCESS_TOKEN_CACHE = token.strip()
        return RTT_ACCESS_TOKEN_CACHE
    return None


def rtt_get(path: str, params: dict[str, Any] | None = None) -> Any:
    params = params or {}
    params.setdefault("version", RTT_API_VERSION)
    url = f"{RTT_BASE_URL}{path}"
    try:
        response = requests.get(url, headers=rtt_headers(), params=params, timeout=18)
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Realtime Trains request failed: {exc}") from exc

    if response.status_code in {401, 403} and refresh_rtt_access_token():
        try:
            response = requests.get(url, headers=rtt_headers(), params=params, timeout=18)
        except requests.RequestException as exc:
            raise HTTPException(status_code=502, detail=f"Realtime Trains request failed after token refresh: {exc}") from exc

    if response.status_code == 204:
        return {"services": []}
    if response.status_code in {401, 403}:
        raise HTTPException(status_code=response.status_code, detail="Realtime Trains token is missing required access, is expired, or cannot be exchanged for an access token.")
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="The requested train service was not found in Realtime Trains.")
    if not response.ok:
        raise HTTPException(status_code=502, detail=f"Realtime Trains returned HTTP {response.status_code}: {response.text[:300]}")
    return response.json()


def parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def display_time(value: Optional[str]) -> Optional[str]:
    parsed = parse_dt(value)
    if parsed:
        return parsed.strftime("%H:%M")
    return value


def code_set(location: dict[str, Any]) -> set[str]:
    codes: set[str] = set()
    for key in ("shortCode", "longCode"):
        value = location.get(key)
        if isinstance(value, str):
            codes.add(value.upper())
    for key in ("shortCodes", "longCodes"):
        for value in location.get(key) or []:
            if isinstance(value, str):
                codes.add(value.upper())
    unique = location.get("uniqueIdentity")
    if isinstance(unique, str):
        codes.add(unique.rsplit(":", 1)[-1].upper())
    return codes


def location_name(location: dict[str, Any] | None) -> str:
    if not location:
        return "Unknown"
    return str(location.get("description") or location.get("name") or next(iter(code_set(location)), "Unknown"))


def temporal_for_public_stop(stop: dict[str, Any]) -> dict[str, Any]:
    temporal = stop.get("temporalData") or {}
    return temporal.get("departure") or temporal.get("arrival") or temporal.get("pass") or {}


def planned_time(temporal: dict[str, Any]) -> Optional[str]:
    return temporal.get("scheduleAdvertised") or temporal.get("scheduleInternal")


def actual_time(temporal: dict[str, Any]) -> Optional[str]:
    return temporal.get("realtimeActual") or temporal.get("realtimeForecast") or temporal.get("realtimeEstimate")


def lateness(temporal: dict[str, Any]) -> Optional[int]:
    value = temporal.get("realtimeAdvertisedLateness")
    if value is None:
        value = temporal.get("realtimeInternalLateness")
    return value


def pair_name(pairs: list[dict[str, Any]] | None) -> str:
    if not pairs:
        return "Unknown"
    return " / ".join(location_name(pair.get("location") or {}) for pair in pairs)


def normalise_candidate(item: dict[str, Any], requested_origin: str, requested_destination: str) -> dict[str, Any]:
    metadata = item.get("scheduleMetadata") or {}
    operator = metadata.get("operator") or {}
    dep = (item.get("temporalData") or {}).get("departure") or temporal_for_public_stop(item)
    destinations = item.get("destination") or []
    destination_stop = destinations[0] if destinations else {}
    arr = ((destination_stop.get("temporalData") or {}).get("arrival") or temporal_for_public_stop(destination_stop)) if destination_stop else {}
    return {
        "identity": metadata.get("identity"),
        "uniqueIdentity": metadata.get("uniqueIdentity"),
        "departureDate": metadata.get("departureDate"),
        "trainReportingIdentity": metadata.get("trainReportingIdentity"),
        "operatorCode": operator.get("code"),
        "operatorName": operator.get("name"),
        "serviceOrigin": pair_name(item.get("origin")),
        "serviceDestination": pair_name(item.get("destination")),
        "requestedOriginCrs": requested_origin.upper(),
        "requestedDestinationCrs": requested_destination.upper(),
        "plannedDeparture": planned_time(dep),
        "actualDeparture": actual_time(dep),
        "departureDisplay": display_time(actual_time(dep) or planned_time(dep)),
        "departureLatenessMinutes": lateness(dep),
        "plannedArrival": planned_time(arr),
        "actualArrival": actual_time(arr),
        "arrivalDisplay": display_time(actual_time(arr) or planned_time(arr)),
        "arrivalLatenessMinutes": lateness(arr),
        "isCancelled": bool(dep.get("isCancelled") or arr.get("isCancelled")),
        "raw": item,
    }


def find_stop(locations: list[dict[str, Any]], requested_code: str) -> Optional[dict[str, Any]]:
    wanted = requested_code.upper()
    for stop in locations:
        location = stop.get("location") or {}
        if wanted in code_set(location):
            return stop
    return None


def enrich_candidate_with_detail(candidate: dict[str, Any], boarded: str, alighted: str) -> dict[str, Any]:
    if candidate.get("plannedArrival") or candidate.get("actualArrival"):
        return candidate
    identity = candidate.get("identity")
    departure_date = candidate.get("departureDate")
    if not identity or not departure_date:
        return candidate
    try:
        payload = rtt_get("/gb-nr/service", {"identity": identity, "departureDate": departure_date})
        detail = normalise_detail(payload, boarded, alighted)
    except HTTPException:
        return candidate
    candidate.update(
        {
            "plannedArrival": detail.get("plannedArrival"),
            "actualArrival": detail.get("actualArrival"),
            "arrivalDisplay": detail.get("arrivalDisplay"),
            "arrivalLatenessMinutes": detail.get("arrivalLatenessMinutes"),
        }
    )
    return candidate


def normalise_detail(payload: dict[str, Any], boarded: str, alighted: str) -> dict[str, Any]:
    service = payload.get("service") or {}
    metadata = service.get("scheduleMetadata") or {}
    operator = metadata.get("operator") or {}
    locations = service.get("locations") or []
    boarding_stop = find_stop(locations, boarded)
    alighting_stop = find_stop(locations, alighted)
    if not boarding_stop or not alighting_stop:
        available = [location_name((stop.get("location") or {})) for stop in locations]
        raise HTTPException(
            status_code=422,
            detail={"message": "Selected service does not call at one of the requested stations.", "availableStops": available},
        )

    departure = (boarding_stop.get("temporalData") or {}).get("departure") or temporal_for_public_stop(boarding_stop)
    arrival = (alighting_stop.get("temporalData") or {}).get("arrival") or temporal_for_public_stop(alighting_stop)
    dep_platform = ((boarding_stop.get("locationMetadata") or {}).get("platform") or {}).get("actual") or ((boarding_stop.get("locationMetadata") or {}).get("platform") or {}).get("planned")
    arr_platform = ((alighting_stop.get("locationMetadata") or {}).get("platform") or {}).get("actual") or ((alighting_stop.get("locationMetadata") or {}).get("platform") or {}).get("planned")

    detail = {
        "travelDate": metadata.get("departureDate"),
        "identity": metadata.get("identity"),
        "uniqueIdentity": metadata.get("uniqueIdentity") or (payload.get("query") or {}).get("uniqueIdentity"),
        "departureDate": metadata.get("departureDate"),
        "trainReportingIdentity": metadata.get("trainReportingIdentity"),
        "operatorCode": operator.get("code"),
        "operatorName": operator.get("name"),
        "serviceOrigin": pair_name(service.get("origin")),
        "serviceDestination": pair_name(service.get("destination")),
        "boarded": {"crs": boarded.upper(), "name": location_name(boarding_stop.get("location") or {})},
        "alighted": {"crs": alighted.upper(), "name": location_name(alighting_stop.get("location") or {})},
        "plannedDeparture": planned_time(departure),
        "actualDeparture": actual_time(departure),
        "departureDisplay": display_time(actual_time(departure) or planned_time(departure)),
        "departureLatenessMinutes": lateness(departure),
        "plannedArrival": planned_time(arrival),
        "actualArrival": actual_time(arrival),
        "arrivalDisplay": display_time(actual_time(arrival) or planned_time(arrival)),
        "arrivalLatenessMinutes": lateness(arrival),
        "platformDeparture": dep_platform,
        "platformArrival": arr_platform,
        "isCancelledAtOrigin": bool(departure.get("isCancelled")),
        "isCancelledAtDestination": bool(arrival.get("isCancelled")),
        "callingPattern": [
            {
                "name": location_name(stop.get("location") or {}),
                "codes": sorted(code_set(stop.get("location") or {})),
                "planned": display_time(planned_time(temporal_for_public_stop(stop))),
                "actual": display_time(actual_time(temporal_for_public_stop(stop))),
                "latenessMinutes": lateness(temporal_for_public_stop(stop)),
                "displayAs": (stop.get("temporalData") or {}).get("displayAs"),
            }
            for stop in locations
        ],
        "raw": payload,
    }
    return detail


def save_journey(detail: dict[str, Any]) -> int:
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.execute(
            """
            INSERT INTO journeys (
                travel_date, boarded_crs, alighted_crs, service_identity, departure_date,
                operator_code, operator_name, train_reporting_identity, service_origin_name,
                service_destination_name, planned_departure, actual_departure,
                departure_lateness_minutes, planned_arrival, actual_arrival,
                arrival_lateness_minutes, platform_departure, platform_arrival, raw_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                detail.get("travelDate"),
                detail["boarded"]["crs"],
                detail["alighted"]["crs"],
                detail.get("identity"),
                detail.get("departureDate"),
                detail.get("operatorCode"),
                detail.get("operatorName"),
                detail.get("trainReportingIdentity"),
                detail.get("serviceOrigin"),
                detail.get("serviceDestination"),
                detail.get("plannedDeparture"),
                detail.get("actualDeparture"),
                detail.get("departureLatenessMinutes"),
                detail.get("plannedArrival"),
                detail.get("actualArrival"),
                detail.get("arrivalLatenessMinutes"),
                detail.get("platformDeparture"),
                detail.get("platformArrival"),
                json.dumps(detail.get("raw"), ensure_ascii=False),
            ),
        )
        conn.commit()
        return int(cursor.lastrowid)


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "database": str(DB_PATH), "rttConfigured": bool(RTT_TOKEN), "rttVersion": RTT_API_VERSION}


@app.get("/api/stations")
def stations(q: str = Query(default="", min_length=0, max_length=80)) -> dict[str, Any]:
    query = q.strip().lower()
    try:
        payload = rtt_get("/data/stops")
        stops = payload.get("stops") or []
        normalised = [
            {"crs": stop.get("shortCode"), "name": stop.get("description"), "uniqueIdentity": stop.get("uniqueIdentity")}
            for stop in stops
            if stop.get("shortCode") and stop.get("description")
        ]
    except HTTPException:
        normalised = FALLBACK_STATIONS
    if query:
        normalised = [s for s in normalised if query in str(s.get("crs", "")).lower() or query in str(s.get("name", "")).lower()]
    return {"stations": normalised[:50]}


@app.post("/api/search-services")
def search_services(request: SearchRequest) -> dict[str, Any]:
    requested_dt = datetime.fromisoformat(f"{request.travelDate}T{request.time}:00")
    time_from = requested_dt - timedelta(minutes=30)
    time_to = time_from + timedelta(minutes=request.windowMinutes)
    payload = rtt_get(
        "/gb-nr/location",
        {
            "code": request.originCrs.upper(),
            "filterTo": request.destinationCrs.upper(),
            "timeFrom": time_from.isoformat(timespec="seconds"),
            "timeTo": time_to.isoformat(timespec="seconds"),
            "detailed": "true",
            "stpFilter": "WVSC",
        },
    )
    services = payload.get("services") or []
    candidates = [normalise_candidate(item, request.originCrs, request.destinationCrs) for item in services]
    candidates = [item for item in candidates if item.get("identity")]
    if candidates:
        with ThreadPoolExecutor(max_workers=min(6, len(candidates))) as executor:
            futures = {
                executor.submit(enrich_candidate_with_detail, candidate, request.originCrs, request.destinationCrs): index
                for index, candidate in enumerate(candidates)
            }
            enriched = list(candidates)
            for future in as_completed(futures):
                enriched[futures[future]] = future.result()
            candidates = enriched
    return {
        "query": request.model_dump(),
        "candidateCount": len(candidates),
        "candidates": candidates,
    }


@app.post("/api/resolve-service")
def resolve_service(request: ResolveRequest) -> dict[str, Any]:
    payload = rtt_get(
        "/gb-nr/service",
        {
            "identity": request.identity,
            "departureDate": request.departureDate,
        },
    )
    detail = normalise_detail(payload, request.originCrs, request.destinationCrs)
    saved_id: int | None = None
    if request.save:
        saved_id = save_journey(detail)
    return {"journeyId": saved_id, "detail": detail}


@app.get("/api/journeys")
def list_journeys(limit: int = Query(default=20, ge=1, le=100)) -> dict[str, Any]:
    init_db()
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT id, travel_date, boarded_crs, alighted_crs, service_identity,
                   departure_date, operator_name, train_reporting_identity,
                   service_origin_name, service_destination_name, planned_departure,
                   actual_departure, departure_lateness_minutes, planned_arrival,
                   actual_arrival, arrival_lateness_minutes, platform_departure,
                   platform_arrival, created_at
            FROM journeys
            ORDER BY travel_date DESC, id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return {"journeys": [dict(row) for row in rows]}
