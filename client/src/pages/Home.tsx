/*
 * Design reminder: Plain SBB-inspired utility interface.
 * Keep the page English-only, simple, compact, red/black/white, and table-first.
 * Avoid decorative imagery, animation, language switching, platform fields, and detail panels.
 */
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Cell, Legend, Pie, PieChart, Tooltip } from "recharts";

type Station = { crs: string; name: string; lat?: number; long?: number };

type SearchForm = {
  travelDate: string;
  originCrs: string;
  destinationCrs: string;
  time: string;
  windowMinutes: number;
};

type Candidate = {
  identity: string;
  uniqueIdentity?: string;
  departureDate: string;
  trainReportingIdentity?: string;
  operatorCode?: string;
  operatorName?: string;
  serviceOriginCrs?: string;
  serviceDestinationCrs?: string;
  plannedDeparture?: string;
  actualDeparture?: string;
  departureDisplay?: string;
  departureLatenessMinutes?: number | null;
  platformDeparture?: string | null;
  plannedArrival?: string;
  actualArrival?: string;
  arrivalDisplay?: string;
  arrivalLatenessMinutes?: number | null;
  platformArrival?: string | null;
  isCancelled?: boolean;
};

type JourneyDetail = {
  identity?: string;
  departureDate?: string;
  trainReportingIdentity?: string;
  operatorName?: string;
  serviceOriginCrs?: string;
  serviceDestinationCrs?: string;
  boarded: { crs: string; name: string };
  alighted: { crs: string; name: string };
  plannedDeparture?: string;
  actualDeparture?: string;
  departureDisplay?: string;
  departureLatenessMinutes?: number | null;
  plannedArrival?: string;
  actualArrival?: string;
  arrivalDisplay?: string;
  arrivalLatenessMinutes?: number | null;
};

type StoredJourney = {
  id: number;
  travel_date: string;
  boarded_crs: string;
  alighted_crs: string;
  service_identity: string;
  operator_name?: string;
  train_reporting_identity?: string;
  service_origin_crs?: string;
  service_destination_crs?: string;
  planned_departure?: string;
  departure_lateness_minutes?: number | null;
  platform_departure?: string | null;
  planned_arrival?: string;
  arrival_lateness_minutes?: number | null;
  platform_arrival?: string | null;
  direction?: string;
  reason?: string;
  detailed_reason?: string;
};

const CHART_COLORS = ["#e0001b", "#111111", "#5b6b7a", "#8faa80", "#e8a838", "#6b8cba", "#cc7a52", "#aaaaaa"];

// Selected from https://en.wikipedia.org/wiki/Wikipedia:WikiProject_UK_Railways/Colours_list
const OPERATOR_COLORS: Record<string, string> = {
  "Avanti West Coast": "004354",
  "c2c": "b7007c",
  "Caledonian Sleeper": "1d2e35",
  "Chiltern Railways": "00bfff",
  "CrossCountry": "660f21",
  "East Midlands Railway": "713563",
  "Great Northern": "6c2d7e",
  "Great Western Railway": "0a493e",
  "Greater Anglia": "d70428",
  "Heathrow Express": "532e63",
  "Hull Trains": "de005c",
  "LNER": "ce0e2d",
  "Lumo": "2b6ef5",
  "Northern": "0f0d78",
  "ScotRail": "1e467d",
  "South Western Railway": "24398c",
  "Southeastern": "389cff",
  "Southern": "8cc63e",
  "Stansted Express": "6b717a",
  "Thameslink": "ff5aa4",
  "TransPennine Express": "09a4ec",
  "Transport for Wales": "ff0000",
  "West Midlands Trains": "ff8300",
};

const DEFAULT_FORM: SearchForm = {
  travelDate: "2026-04-27",
  originCrs: "MKC",
  destinationCrs: "EUS",
  time: "18:55",
  windowMinutes: 10,
};

function delayText(value?: number | null) {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "RT";
  return value > 0 ? `+${value}` : `${value}`;
}

function delayClass(value?: number | null) {
  if (value === null || value === undefined) return "delay-unknown";
  if (value <= 0) return "delay-ok";
  if (value <= 5) return "delay-small";
  return "delay-late";
}

function timeOnly(value?: string) {
  if (!value) return "—";
  const match = value.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : value.slice(0, 5);
}

function operatorFg(hex: string): string {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.179 ? "#000000" : "#ffffff";
}

function OperatorBadge({ name }: { name: string }) {
  const hex = OPERATOR_COLORS[name];
  if (!hex) return <>{name}</>;
  return (
    <span className="operator-badge" style={{ backgroundColor: `#${hex}`, color: operatorFg(hex) }}>
      {name}
    </span>
  );
}

async function apiJson<T>(url: string, options?: RequestInit): Promise<T> {
  const { headers: extra, ...rest } = options ?? {};
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(extra as Record<string, string> | undefined) },
    ...rest,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body.detail === "string" ? body.detail : body.detail?.message || response.statusText;
    throw new Error(detail);
  }
  return body as T;
}

function StationInput({
  stations,
  value,
  onChange,
}: {
  stations: Station[];
  value: string;
  onChange: (crs: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const matched = useMemo(() => stations.find((s) => s.crs === value), [stations, value]);
  const displayLabel = matched ? `${matched.name} (${matched.crs})` : value;

  const filtered = useMemo(() => {
    if (!editing) return [];
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return stations
      .filter((s) => s.name.toLowerCase().includes(q) || s.crs.toLowerCase().startsWith(q))
      .slice(0, 15);
  }, [stations, query, editing]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setEditing(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="station-input" ref={ref}>
      <input
        value={editing ? query : displayLabel}
        readOnly={!editing}
        onFocus={() => { setEditing(true); setQuery(""); }}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => { setEditing(false); setQuery(""); }, 150)}
        placeholder={editing ? "Type station name or CRS…" : undefined}
      />
      {editing && filtered.length > 0 && (
        <div className="station-dropdown">
          {filtered.map((s) => (
            <div
              key={s.crs}
              className="station-option"
              onMouseDown={() => { onChange(s.crs); setEditing(false); setQuery(""); }}
            >
              <span>{s.name}</span><span className="station-crs">{s.crs}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [apiToken, setApiToken] = useState<string>(() => localStorage.getItem("rtt_api_token") ?? "");
  const [showTokenDialog, setShowTokenDialog] = useState(() => !localStorage.getItem("rtt_api_token"));
  const [draftToken, setDraftToken] = useState<string>(() => localStorage.getItem("rtt_api_token") ?? "");
  const [dialogStatus, setDialogStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [dialogError, setDialogError] = useState("");
  const [tokenValidUntil, setTokenValidUntil] = useState("");
  const accessTokenCache = useRef<{ token: string; expiresAt: number } | null>(null);

  useEffect(() => { accessTokenCache.current = null; }, [apiToken]);

  async function handleExchange() {
    const t = draftToken.trim();
    if (!t) return;
    setDialogStatus("loading");
    setDialogError("");
    try {
      const data = await apiJson<{ accessToken: string; validUntil: string }>(
        "/api/exchange-token",
        { headers: { "X-RTT-Token": t } },
      );
      accessTokenCache.current = { token: data.accessToken, expiresAt: new Date(data.validUntil).getTime() };
      setApiToken(t);
      localStorage.setItem("rtt_api_token", t);
      setTokenValidUntil(data.validUntil);
      setDialogStatus("ok");
    } catch (err) {
      setDialogStatus("error");
      setDialogError(err instanceof Error ? err.message : String(err));
    }
  }

  async function getEffectiveToken(): Promise<string> {
    const cache = accessTokenCache.current;
    if (cache && cache.expiresAt - Date.now() > 60_000) return cache.token;
    try {
      const data = await apiJson<{ accessToken: string; validUntil: string }>(
        "/api/exchange-token",
        { headers: { "X-RTT-Token": apiToken } },
      );
      accessTokenCache.current = { token: data.accessToken, expiresAt: new Date(data.validUntil).getTime() };
      return data.accessToken;
    } catch {
      return apiToken;
    }
  }

  const [form, setForm] = useState<SearchForm>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [history, setHistory] = useState<StoredJourney[]>([]);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(() => new Set());
  const [pendingCandidate, setPendingCandidate] = useState<Candidate | null>(null);
  const [viewingDetail, setViewingDetail] = useState<StoredJourney | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const [addDirection, setAddDirection] = useState<"Outbound" | "Inbound">("Outbound");
  const [addReason, setAddReason] = useState<"Love" | "Leisure" | "Life" | "Work">("Love");
  const [addDetailedReason, setAddDetailedReason] = useState<string>("");
  const [stations, setStations] = useState<Station[]>([]);

  const stationMap = useMemo(() => new Map(stations.map((s) => [s.crs, s.name])), [stations]);

  const operatorData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of history) {
      const key = j.operator_name || "Unknown";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [history]);

  const reasonData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of history) {
      const key = j.reason || "Unknown";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [history]);

  function stationLabel(crs?: string): string {
    if (!crs) return "—";
    const name = stationMap.get(crs);
    return name ? `${name} (${crs})` : crs;
  }

  const candidateCount = useMemo(() => candidates.length, [candidates]);

  async function loadStations() {
    try {
      const data = await apiJson<{ stations: Station[] }>("/api/stations-local");
      setStations(data.stations);
    } catch {
      // silently fail — station names are cosmetic
    }
  }

  async function deleteJourney(id: number) {
    try {
      await apiJson(`/api/journeys/${id}`, { method: "DELETE" });
      setHistory((prev) => prev.filter((j) => j.id !== id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function loadHistory() {
    try {
      const data = await apiJson<{ journeys: StoredJourney[] }>("/api/journeys?limit=80");
      const sorted = [...data.journeys].sort((a, b) => {
        const dateCmp = b.travel_date.localeCompare(a.travel_date);
        if (dateCmp !== 0) return dateCmp;
        return (b.planned_departure ?? "").localeCompare(a.planned_departure ?? "");
      });
      setHistory(sorted);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    loadHistory();
    loadStations();
  }, []);

  useEffect(() => {
    if (!showMap || !mapRef.current) return;
    const map = L.map(mapRef.current).setView([54, -2], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    const routeCounts = new Map<string, number>();
    for (const j of history) {
      const key = [j.boarded_crs, j.alighted_crs].sort().join("|");
      routeCounts.set(key, (routeCounts.get(key) ?? 0) + 1);
    }
    function routeColor(count: number): string {
      if (count < 3)  return "#4a90d9";
      if (count < 6)  return "#f5a623";
      if (count < 10) return "#e07000";
      return "#e0001b";
    }

    const drawnRoutes = new Set<string>();
    const drawnStations = new Set<string>();
    for (const j of history) {
      const key = [j.boarded_crs, j.alighted_crs].sort().join("|");
      const from = stations.find((s) => s.crs === j.boarded_crs);
      const to = stations.find((s) => s.crs === j.alighted_crs);
      if (!from?.lat || !to?.lat) continue;
      if (!drawnRoutes.has(key)) {
        const count = routeCounts.get(key) ?? 1;
        L.polyline([[from.lat, from.long!], [to.lat, to.long!]], { color: routeColor(count), weight: 3, opacity: 0.85 })
          .addTo(map).bindPopup(`${from.name} ↔ ${to.name} (${count}×)`);
        drawnRoutes.add(key);
      }
      for (const st of [from, to]) {
        if (!drawnStations.has(st.crs)) {
          L.circleMarker([st.lat!, st.long!], { radius: 3, color: "#333333", fillColor: "#333333", fillOpacity: 1, weight: 0 })
            .addTo(map).bindPopup(st.name);
          drawnStations.add(st.crs);
        }
      }
    }
    return () => { map.remove(); };
  }, [showMap]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setCandidates([]);
    try {
      const token = await getEffectiveToken();
      const data = await apiJson<{ candidates: Candidate[] }>("/api/search-services", {
        method: "POST",
        headers: { "X-RTT-Token": token },
        body: JSON.stringify({
          ...form,
          originCrs: form.originCrs.toUpperCase(),
          destinationCrs: form.destinationCrs.toUpperCase(),
        }),
      });
      setCandidates(data.candidates);
      setMessage(data.candidates.length ? `Found ${data.candidates.length} candidate services.` : "No matching services found.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function addJourney(candidate: Candidate, direction: string, reason: string, detailedReason: string) {
    setSavingId(candidate.identity);
    setPendingCandidate(null);
    setMessage("");
    try {
      const token = await getEffectiveToken();
      const data = await apiJson<{ journeyId: number | null; detail: JourneyDetail }>("/api/resolve-service", {
        method: "POST",
        headers: { "X-RTT-Token": token },
        body: JSON.stringify({
          travelDate: form.travelDate,
          originCrs: form.originCrs.toUpperCase(),
          destinationCrs: form.destinationCrs.toUpperCase(),
          identity: candidate.identity,
          departureDate: candidate.departureDate || form.travelDate,
          save: true,
          direction,
          reason,
          detailedReason,
        }),
      });
      setSavedKeys((previous) => new Set(previous).add(`${candidate.identity}-${candidate.departureDate}`));
      setMessage(`Added ${data.detail.trainReportingIdentity || data.detail.identity || candidate.identity} to journey history.`);
      await loadHistory();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingId("");
    }
  }

  return (
    <main className="plain-shell">
      <header className="plain-header">
        <div className="brand-mark">UK Rail History</div>
        <div className="header-actions">
          <button type="button" className="stats-header-btn" onClick={() => setShowStats(true)}>Stats</button>
          <button type="button" className="stats-header-btn" onClick={() => setShowMap(true)}>Map</button>
        </div>
        <button type="button" className="token-header-btn" onClick={() => { setDraftToken(apiToken); setDialogStatus("idle"); setShowTokenDialog(true); }}>
          {apiToken ? "Token ✓" : "Set token"}
        </button>
      </header>

      {showTokenDialog && (
        <div className="token-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowTokenDialog(false); }}>
          <div className="token-dialog">
            <div className="token-dialog-header">
              <span>RTT API Token</span>
              <button type="button" className="token-dialog-close" onClick={() => setShowTokenDialog(false)}>×</button>
            </div>
            <p className="token-dialog-desc">Enter your refresh token from <a href="https://api-portal.rtt.io" target="_blank" rel="noopener noreferrer">api-portal.rtt.io</a>.</p>
            <input
              type="text"
              className="token-dialog-input"
              value={draftToken}
              onChange={(e) => { setDraftToken(e.target.value); setDialogStatus("idle"); }}
              placeholder="eyJ…"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleExchange(); }}
            />
            <div className="token-dialog-actions">
              <button type="button" onClick={handleExchange} disabled={dialogStatus === "loading" || !draftToken.trim()}>
                {dialogStatus === "loading" ? "Exchanging…" : "Exchange token"}
              </button>
              {dialogStatus === "ok" && <button type="button" onClick={() => setShowTokenDialog(false)}>Done</button>}
            </div>
            {dialogStatus === "ok" && (
              <div className="token-status-ok">Token valid until {new Date(tokenValidUntil).toLocaleTimeString()}</div>
            )}
            {dialogStatus === "error" && (
              <div className="token-status-error">{dialogError}</div>
            )}
          </div>
        </div>
      )}

      {pendingCandidate && (
        <div className="token-overlay" onClick={(e) => { if (e.target === e.currentTarget) setPendingCandidate(null); }}>
          <div className="token-dialog">
            <div className="token-dialog-header">
              <span>Add Journey — {pendingCandidate.trainReportingIdentity || pendingCandidate.identity}</span>
              <button type="button" className="token-dialog-close" onClick={() => setPendingCandidate(null)}>×</button>
            </div>
            <div className="add-dialog-body">
              <div className="add-dialog-field">
                <span>Direction</span>
                <div className="add-dialog-options">
                  {(["Outbound", "Inbound"] as const).map((d) => (
                    <button type="button" key={d} className={`add-dialog-option${addDirection === d ? " selected" : ""}`} onClick={() => setAddDirection(d)}>{d}</button>
                  ))}
                </div>
              </div>
              <div className="add-dialog-field">
                <span>Reason</span>
                <div className="add-dialog-options">
                  {(["Love", "Leisure", "Life", "Work"] as const).map((r) => (
                    <button type="button" key={r} className={`add-dialog-option${addReason === r ? " selected" : ""}`} onClick={() => setAddReason(r)}>{r}</button>
                  ))}
                </div>
              </div>
              <div className="add-dialog-field">
                <span>Detail</span>
                <input type="text" className="add-dialog-input" value={addDetailedReason} onChange={(e) => setAddDetailedReason(e.target.value)} placeholder="Optional note" />
              </div>
            </div>
            <div className="token-dialog-actions">
              <button type="button" onClick={() => addJourney(pendingCandidate, addDirection, addReason, addDetailedReason)} disabled={savingId === pendingCandidate.identity}>
                {savingId === pendingCandidate.identity ? "Adding…" : "Add to history"}
              </button>
              <button type="button" onClick={() => setPendingCandidate(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {viewingDetail && (
        <div className="token-overlay" onClick={(e) => { if (e.target === e.currentTarget) setViewingDetail(null); }}>
          <div className="token-dialog">
            <div className="token-dialog-header">
              <span>{viewingDetail.train_reporting_identity || viewingDetail.service_identity} — {viewingDetail.travel_date}</span>
              <button type="button" className="token-dialog-close" onClick={() => setViewingDetail(null)}>×</button>
            </div>
            <div className="add-dialog-body">
              <div className="add-dialog-field"><span>From</span><span>{stationLabel(viewingDetail.boarded_crs)}</span></div>
              <div className="add-dialog-field"><span>To</span><span>{stationLabel(viewingDetail.alighted_crs)}</span></div>
              <div className="add-dialog-field"><span>Direction</span><span>{viewingDetail.direction ?? "—"}</span></div>
              <div className="add-dialog-field"><span>Reason</span><span>{viewingDetail.reason ?? "—"}</span></div>
              <div className="add-dialog-field"><span>Detail</span><span>{viewingDetail.detailed_reason || "—"}</span></div>
            </div>
            <div className="token-dialog-actions">
              <button type="button" onClick={() => setViewingDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showStats && (
        <div className="token-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowStats(false); }}>
          <div className="token-dialog stats-dialog">
            <div className="token-dialog-header">
              <span>Statistics — {history.length} journeys</span>
              <button type="button" className="token-dialog-close" onClick={() => setShowStats(false)}>×</button>
            </div>
            <div className="stats-charts">
              <div className="stats-chart">
                <div className="stats-chart-title">By Operator</div>
                <PieChart width={260} height={240}>
                  <Pie data={operatorData} cx={130} cy={115} outerRadius={85} dataKey="value" label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false} isAnimationActive={false}>
                    {operatorData.map((entry, i) => <Cell key={i} fill={OPERATOR_COLORS[entry.name] ? `#${OPERATOR_COLORS[entry.name]}` : CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, n]} />
                  <Legend />
                </PieChart>
              </div>
              <div className="stats-chart">
                <div className="stats-chart-title">By Reason</div>
                <PieChart width={260} height={240}>
                  <Pie data={reasonData} cx={130} cy={115} outerRadius={85} dataKey="value" label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false} isAnimationActive={false}>
                    {reasonData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, n]} />
                  <Legend />
                </PieChart>
              </div>
            </div>
            <div className="token-dialog-actions">
              <button type="button" onClick={() => setShowStats(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showMap && (
        <div className="token-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowMap(false); }}>
          <div className="token-dialog map-dialog">
            <div className="token-dialog-header">
              <span>Journey Map — {history.length} journeys</span>
              <button type="button" className="token-dialog-close" onClick={() => setShowMap(false)}>×</button>
            </div>
            <div ref={mapRef} className="map-container" />
            <div className="token-dialog-actions">
              <button type="button" onClick={() => setShowMap(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <section className="search-panel">
        <div className="section-title"><h2>New Journey</h2></div>
        <form className="search-form" onSubmit={search}>
          <label>Date<input type="date" value={form.travelDate} onChange={(event) => setForm({ ...form, travelDate: event.target.value })} /></label>
          <label>From<StationInput stations={stations} value={form.originCrs} onChange={(crs) => setForm({ ...form, originCrs: crs })} /></label>
          <button type="button" className="swap-btn" title="Swap From / To" onClick={() => setForm((f) => ({ ...f, originCrs: f.destinationCrs, destinationCrs: f.originCrs }))}>⇄</button>
          <label>To<StationInput stations={stations} value={form.destinationCrs} onChange={(crs) => setForm({ ...form, destinationCrs: crs })} /></label>
          <label>Near<input type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} /></label>
          <label>Window<span className="input-with-unit"><input type="number" min={8} max={180} value={form.windowMinutes} onChange={(event) => setForm({ ...form, windowMinutes: Number(event.target.value) })} onBlur={(event) => { const v = Number(event.target.value); setForm((f) => ({ ...f, windowMinutes: Math.max(8, Math.min(180, v)) })); }} /><span>min</span></span></label>
          <button type="submit" disabled={loading}>{loading ? "Searching" : "Search"}</button>
        </form>
      </section>

      {message && <div className="message-line" role="status">{message}</div>}

      <section className="table-section">
        <div className="section-title"><h2>Candidate Services</h2><span>{candidateCount} rows</span></div>
        <div className="plain-table candidate-table">
          <div className="table-head candidate-row">
            <span>Service</span><span>Svc from</span><span>Svc to</span><span>Operator</span><span>Dep plat</span><span>Booked dep</span><span>Dep delay</span><span>Arr plat</span><span>Booked arr</span><span>Arr delay</span><span>Action</span>
          </div>
          {candidates.length === 0 ? (
            <div className="empty-row">No search results yet.</div>
          ) : candidates.map((candidate) => {
            const key = `${candidate.identity}-${candidate.departureDate}`;
            const saved = savedKeys.has(key);
            return (
              <div className="data-row candidate-row" key={key}>
                <span>{candidate.trainReportingIdentity || candidate.identity}</span>
                <span className="truncate">{stationLabel(candidate.serviceOriginCrs)}</span>
                <span className="truncate">{stationLabel(candidate.serviceDestinationCrs)}</span>
                <span className="truncate">{candidate.operatorName ? <OperatorBadge name={candidate.operatorName} /> : candidate.operatorCode || "—"}</span>
                <span>{candidate.platformDeparture ?? "—"}</span>
                <span>{timeOnly(candidate.plannedDeparture)}</span>
                <b className={delayClass(candidate.departureLatenessMinutes)}>{delayText(candidate.departureLatenessMinutes)}</b>
                <span>{candidate.platformArrival ?? "—"}</span>
                <span>{timeOnly(candidate.plannedArrival)}</span>
                <b className={delayClass(candidate.arrivalLatenessMinutes)}>{delayText(candidate.arrivalLatenessMinutes)}</b>
                <button type="button" onClick={() => { setPendingCandidate(candidate); setAddDirection("Outbound"); setAddReason("Love"); setAddDetailedReason(""); }} disabled={savingId === candidate.identity || saved}>{saved ? "Added" : savingId === candidate.identity ? "Adding" : "Add"}</button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="table-section">
        <div className="section-title"><h2>Journey History</h2><button type="button" onClick={loadHistory}>Refresh</button></div>
        <div className="plain-table history-table">
          <div className="table-head history-row">
            <span>Date</span><span>Service</span><span>Operator</span><span>From</span><span>To</span><span>Svc from</span><span>Svc to</span><span>Dir</span><span>Reason</span><span>Dep plat</span><span>Booked dep</span><span>Dep delay</span><span>Arr plat</span><span>Booked arr</span><span>Arr delay</span><span></span>
          </div>
          {history.length === 0 ? (
            <div className="empty-row">No journeys saved.</div>
          ) : history.map((item) => (
            <div className="data-row history-row" key={item.id}>
              <span>{item.travel_date.replace(/-/g, "")}</span>
              <span>{item.train_reporting_identity || item.service_identity}</span>
              <span className="truncate">{item.operator_name ? <OperatorBadge name={item.operator_name} /> : "—"}</span>
              <span className="truncate">{stationLabel(item.boarded_crs)}</span>
              <span className="truncate">{stationLabel(item.alighted_crs)}</span>
              <span className="truncate">{stationLabel(item.service_origin_crs)}</span>
              <span className="truncate">{stationLabel(item.service_destination_crs)}</span>
              <span>{item.direction ?? "—"}</span>
              <span>{item.reason ?? "—"}</span>
              <span>{item.platform_departure ?? "—"}</span>
              <span>{timeOnly(item.planned_departure)}</span>
              <b className={delayClass(item.departure_lateness_minutes)}>{delayText(item.departure_lateness_minutes)}</b>
              <span>{item.platform_arrival ?? "—"}</span>
              <span>{timeOnly(item.planned_arrival)}</span>
              <b className={delayClass(item.arrival_lateness_minutes)}>{delayText(item.arrival_lateness_minutes)}</b>
              <span className="row-actions">
                <button type="button" className="icon-btn" title="View detail" onClick={() => setViewingDetail(item)}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><ellipse cx="6.5" cy="6.5" rx="5.5" ry="3.5"/><circle cx="6.5" cy="6.5" r="1.5"/></svg>
                </button>
                <button type="button" className="icon-btn del-btn" title="Delete" onClick={() => deleteJourney(item.id)}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 3.5h9M4.5 3.5v-1h4v1M3 3.5l.8 7h5.4l.8-7"/></svg>
                </button>
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
