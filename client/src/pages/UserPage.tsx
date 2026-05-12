/*
 * Design reminder: Plain SBB-inspired utility interface.
 * Keep the page English-only, simple, compact, red/black/white, and table-first.
 * Avoid decorative imagery, animation, language switching, platform fields, and detail panels.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { ApiError, apiJson } from "@/lib/api";
import { OPERATOR_COLORS, OperatorBadge, normaliseOperator } from "@/lib/operators";
import { auth } from "@/lib/auth";
import { publicAsset } from "@/lib/assets";
import { isValidUsername } from "@/lib/username";
import JourneySearch, { type Candidate, type SearchForm, type Station } from "@/components/JourneySearch";
import NotFound from "./NotFound";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type JourneyDetail = {
  identity?: string;
  departureDate?: string;
  operatorName?: string;
  serviceOriginCrs?: string;
  serviceDestinationCrs?: string;
  boarded: { crs: string; name: string };
  alighted: { crs: string; name: string };
  plannedDeparture?: string;
  departureLatenessMinutes?: number | null;
  plannedArrival?: string;
  arrivalLatenessMinutes?: number | null;
};

type StoredJourney = {
  id: number;
  travel_date: string;
  boarded_crs: string;
  alighted_crs: string;
  url?: string;
  operator_name?: string;
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

const DETAIL_MAX_CHARS = 45;

function limitDetail(value: string): string {
  return Array.from(value).slice(0, DETAIL_MAX_CHARS).join("");
}

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

function timeWithDelay(time?: string, delay?: number | null) {
  const displayTime = timeOnly(time);
  if (delay === null || delay === undefined) return displayTime;
  return <>{displayTime} (<b className={delayClass(delay)}>{delayText(delay)}</b>)</>;
}

export default function UserPage() {
  const { username } = useParams<{ username: string }>();
  const [, setLocation] = useLocation();

  if (!username || !isValidUsername(username)) return <NotFound />;

  const token = auth.token();
  const canEdit = !!token && auth.user() === username;
  const [displayName, setDisplayName] = useState<string>(username);

  function authHeaders(): Record<string, string> {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function logout() {
    auth.clear();
    setLocation("/");
  }

  const [rttCookie, setRttCookie] = useState<string>(() => localStorage.getItem("rtt_cookie") ?? "");
  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [draftCookie, setDraftCookie] = useState<string>(() => localStorage.getItem("rtt_cookie") ?? "");

  function saveCookie() {
    const c = draftCookie.trim();
    if (!c) return;
    setRttCookie(c);
    localStorage.setItem("rtt_cookie", c);
    setShowTokenDialog(false);
  }

  const [savingId, setSavingId] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [history, setHistory] = useState<StoredJourney[]>([]);
  const [sortAsc, setSortAsc] = useState(false);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(() => new Set());
  const savedKeyById = useRef<Map<number, string>>(new Map());
  const [pendingCandidate, setPendingCandidate] = useState<Candidate | null>(null);
  const [pendingSearchForm, setPendingSearchForm] = useState<SearchForm | null>(null);

  const [notFound, setNotFound] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [hidePersonalCols, setHidePersonalCols] = useState(() => localStorage.getItem("hide_personal_cols") === "1");
  const [hideHistoryAfterEnabled, setHideHistoryAfterEnabled] = useState(() => localStorage.getItem("hide_history_after_enabled") === "1" || !!localStorage.getItem("hide_history_after_date"));
  const [hideHistoryAfterDate, setHideHistoryAfterDate] = useState(() => localStorage.getItem("hide_history_after_date") ?? "");
  const mapRef = useRef<HTMLDivElement>(null);
  const [addDirection, setAddDirection] = useState<"Outbound" | "Inbound">("Outbound");
  const [addReason, setAddReason] = useState<"Leisure" | "Work" | "Life" | "Love">("Leisure");
  const [addDetailedReason, setAddDetailedReason] = useState<string>("");
  const [editingJourney, setEditingJourney] = useState<StoredJourney | null>(null);
  const [editDirection, setEditDirection] = useState<"Outbound" | "Inbound">("Outbound");
  const [editReason, setEditReason] = useState<"Leisure" | "Work" | "Life" | "Love">("Leisure");
  const [editDetailedReason, setEditDetailedReason] = useState<string>("");
  const [stations, setStations] = useState<Station[]>([]);

  const stationMap = useMemo(() => new Map(stations.map((s) => [s.crs, s.name])), [stations]);

  const operatorData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of history) {
      const key = j.operator_name ? normaliseOperator(j.operator_name) : "Unknown";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const threshold = history.length * 0.02;
    const result: { name: string; value: number }[] = [];
    let othersCount = 0;
    for (const [name, value] of sorted) {
      if (value >= threshold) result.push({ name, value });
      else othersCount += value;
    }
    if (othersCount > 0) result.push({ name: "Others", value: othersCount });
    return result;
  }, [history]);

  const arrivalDelayData = useMemo(() => {
    const buckets = [
      { name: "≤ 1 min", min: -Infinity, max: 2, value: 0 },
      { name: "2-15 min", min: 2, max: 15, value: 0 },
      { name: "15–30 min", min: 15, max: 30, value: 0 },
      { name: "30–60 min", min: 30, max: 60, value: 0 },
      { name: "60+ min", min: 60, max: Infinity, value: 0 },
    ];
    for (const j of history) {
      if (j.arrival_lateness_minutes == null) continue;
      const m = j.arrival_lateness_minutes;
      for (const b of buckets) {
        if (m >= b.min && m < b.max) { b.value++; break; }
      }
    }
    return buckets;
  }, [history]);

  const monthlyData = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const counts = new Array(12).fill(0);
    for (const j of history) {
      const m = parseInt(j.travel_date.slice(5, 7), 10) - 1;
      if (m >= 0 && m < 12) counts[m]++;
    }
    return months.map((name, i) => ({ name, value: counts[i] }));
  }, [history]);

  const topStationsData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of history) {
      counts.set(j.boarded_crs, (counts.get(j.boarded_crs) ?? 0) + 1);
      counts.set(j.alighted_crs, (counts.get(j.alighted_crs) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([crs, value]) => ({ name: stationMap.get(crs) ? `${stationMap.get(crs)} (${crs})` : crs, value }));
  }, [history, stationMap]);

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

  async function loadStations() {
    try {
      const data = await apiJson<{ stations: Station[] }>("/api/stations-local");
      setStations(data.stations);
    } catch {
      // silently fail — station names are cosmetic
    }
  }

  async function loadHistory() {
    setNotFound(false);
    setMessage("");
    try {
      const data = await apiJson<{ display_name: string; journeys: StoredJourney[] }>(`/api/journeys?username=${encodeURIComponent(username)}&limit=800`, { headers: authHeaders() });
      setDisplayName(data.display_name);
      setHistory(data.journeys);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setNotFound(true);
      } else {
        setMessage(error instanceof Error ? error.message : String(error));
      }
    }
  }

  async function updateJourney(id: number, direction: string, reason: string, detailedReason: string) {
    try {
      await apiJson(`/api/journeys/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ direction, reason, detailed_reason: detailedReason }),
      });
      setHistory((prev) => prev.map((j) => j.id === id ? { ...j, direction, reason, detailed_reason: detailedReason } : j));
      setEditingJourney(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function deleteJourney(id: number) {
    try {
      await apiJson(`/api/journeys/${id}`, { method: "DELETE", headers: authHeaders() });
      setHistory((prev) => prev.filter((j) => j.id !== id));
      const key = savedKeyById.current.get(id);
      if (key) {
        savedKeyById.current.delete(id);
        setSavedKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function addJourney(candidate: Candidate, searchForm: SearchForm, direction: string, reason: string, detailedReason: string) {
    setSavingId(candidate.identity);
    setPendingCandidate(null);
    setPendingSearchForm(null);
    setMessage("");
    try {
      const data = await apiJson<{ journeyId: number | null; detail: JourneyDetail }>("/api/resolve-service", {
        method: "POST",
        headers: { "X-RTT-Cookie": rttCookie, ...authHeaders() },
        body: JSON.stringify({
          travelDate: searchForm.travelDate,
          originCrs: searchForm.originCrs.toUpperCase(),
          destinationCrs: searchForm.destinationCrs.toUpperCase(),
          identity: candidate.identity,
          departureDate: candidate.departureDate || searchForm.travelDate,
          save: true,
          direction,
          reason,
          detailedReason,
        }),
      });
      const savedKey = `${candidate.identity}-${candidate.departureDate}`;
      setSavedKeys((prev) => new Set(prev).add(savedKey));
      if (data.journeyId !== null) savedKeyById.current.set(data.journeyId!, savedKey);
      setMessage(`Added ${data.detail.identity || candidate.identity} to journey history.`);
      await loadHistory();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingId("");
    }
  }

  const sortedHistory = useMemo(() => [...history].sort((a, b) => {
    const dateCmp = a.travel_date.localeCompare(b.travel_date);
    const timeCmp = (a.planned_departure ?? "").localeCompare(b.planned_departure ?? "");
    return sortAsc ? (dateCmp !== 0 ? dateCmp : timeCmp) : (dateCmp !== 0 ? -dateCmp : -timeCmp);
  }), [history, sortAsc]);

  const activeHideHistoryAfterDate = hideHistoryAfterEnabled ? hideHistoryAfterDate : "";
  const visibleHistory = useMemo(() => {
    if (!activeHideHistoryAfterDate) return sortedHistory;
    return sortedHistory.filter((j) => j.travel_date <= activeHideHistoryAfterDate);
  }, [sortedHistory, activeHideHistoryAfterDate]);

  useEffect(() => {
    loadHistory();
    loadStations();
  }, [username]);

  useEffect(() => {
    if (!showMap || !mapRef.current) return;
    const map = L.map(mapRef.current).setView([54, -2], 6);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
    }).addTo(map);

    const routeCounts = new Map<string, number>();
    for (const j of history) {
      const key = [j.boarded_crs, j.alighted_crs].sort().join("|");
      routeCounts.set(key, (routeCounts.get(key) ?? 0) + 1);
    }
    function routeColor(count: number): string {
      if (count < 3) return "#4a90d9";
      if (count < 6) return "#f5a623";
      if (count < 10) return "#e07000";
      return "#e0001b";
    }
    const stationByCrs = new Map(stations.map((s) => [s.crs, s]));

    // Draw routes sorted by count ascending so high-frequency routes render on top
    const sortedRoutes = Array.from(routeCounts.entries()).sort((a, b) => a[1] - b[1]);
    const drawnStations = new Set<string>();
    for (const [key, count] of sortedRoutes) {
      const [crs1, crs2] = key.split("|");
      const from = stationByCrs.get(crs1);
      const to = stationByCrs.get(crs2);
      if (from?.lat == null || from?.long == null || to?.lat == null || to?.long == null) continue;
      L.polyline([[from.lat, from.long], [to.lat, to.long]], { color: routeColor(count), weight: 2, opacity: 0.85 })
        .addTo(map).bindPopup(`${from.name} ↔ ${to.name} (${count}×)`);
      for (const st of [from, to]) {
        if (!drawnStations.has(st.crs) && st.lat != null && st.long != null) {
          L.circleMarker([st.lat, st.long], { radius: 3, color: "#333333", fillColor: "#333333", fillOpacity: 1, weight: 0 })
            .addTo(map).bindPopup(st.name);
          drawnStations.add(st.crs);
        }
      }
    }
    return () => { map.remove(); };
  }, [showMap, history, stations]);

  const showPersonalCols = canEdit && !hidePersonalCols;
  const historyCols = 10 + (showPersonalCols ? 3 : 0) + (canEdit ? 1 : 0);

  if (notFound) return <NotFound />;

  return (
    <main className="plain-shell">
      <header className="plain-header">
        <div className="brand-mark">
          <img src={publicAsset("national-rail.svg")} alt="National Rail" />
          {displayName}'s UK Railway Journeys
        </div>
        <div className="header-actions">
          <button type="button" className="stats-header-btn" onClick={() => setShowStats(true)}>Stats</button>
          <button type="button" className="stats-header-btn" onClick={() => setShowMap(true)}>Map</button>
          <button type="button" className="stats-header-btn" onClick={() => setShowOptions(true)}>Options</button>
        </div>
        {token ? (
          <button type="button" className="token-header-btn" onClick={logout}>Sign out</button>
        ) : (
          <button type="button" className="token-header-btn" onClick={() => setLocation("/login/")}>Sign in</button>
        )}
      </header>

      {token && showTokenDialog && (
        <div className="token-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowTokenDialog(false); }}>
          <div className="token-dialog">
            <div className="token-dialog-header">
              <span>RTT Cookie</span>
              <button type="button" className="token-dialog-close" onClick={() => setShowTokenDialog(false)}>×</button>
            </div>
            <p className="token-dialog-desc">Paste your browser cookie from <a href="https://www.realtimetrains.co.uk" target="_blank" rel="noopener noreferrer">realtimetrains.co.uk</a> (requires RTT+ subscription).</p>
            <input type="text" name="rtt-session-cookie-text" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} data-lpignore="true" data-1p-ignore="true" data-bwignore="true" className="token-dialog-input" value={draftCookie} onChange={(e) => setDraftCookie(e.target.value)}
              placeholder="Rtt_AuthIndicator=true; _oauth2_proxy=…" autoFocus onKeyDown={(e) => { if (e.key === "Enter") saveCookie(); }} />
            <div className="token-dialog-actions">
              <button type="button" onClick={saveCookie} disabled={!draftCookie.trim()}>Save</button>
            </div>
          </div>
        </div>
      )}

      {canEdit && pendingCandidate && (
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
                  {(["Leisure", "Work", "Life", "Love"] as const).map((r) => (
                    <button type="button" key={r} className={`add-dialog-option${addReason === r ? " selected" : ""}`} onClick={() => setAddReason(r)}>{r}</button>
                  ))}
                </div>
              </div>
              <div className="add-dialog-field">
                <span>Detail</span>
                <input type="text" className="add-dialog-input" value={addDetailedReason} onChange={(e) => setAddDetailedReason(limitDetail(e.target.value))} placeholder="Optional note" />
              </div>
            </div>
            <div className="token-dialog-actions">
              <button type="button" onClick={() => pendingSearchForm && addJourney(pendingCandidate, pendingSearchForm, addDirection, addReason, addDetailedReason)} disabled={savingId === pendingCandidate.identity || !pendingSearchForm}>
                {savingId === pendingCandidate.identity ? "Adding…" : "Add to history"}
              </button>
              <button type="button" onClick={() => setPendingCandidate(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {canEdit && editingJourney && (
        <div className="token-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditingJourney(null); }}>
          <div className="token-dialog">
            <div className="token-dialog-header">
              <span>Edit Journey — {editingJourney.travel_date}</span>
              <button type="button" className="token-dialog-close" onClick={() => setEditingJourney(null)}>×</button>
            </div>
            <div className="add-dialog-body">
              <div className="add-dialog-field">
                <span>Direction</span>
                <div className="add-dialog-options">
                  {(["Outbound", "Inbound"] as const).map((d) => (
                    <button type="button" key={d} className={`add-dialog-option${editDirection === d ? " selected" : ""}`} onClick={() => setEditDirection(d)}>{d}</button>
                  ))}
                </div>
              </div>
              <div className="add-dialog-field">
                <span>Reason</span>
                <div className="add-dialog-options">
                  {(["Leisure", "Work", "Life", "Love"] as const).map((r) => (
                    <button type="button" key={r} className={`add-dialog-option${editReason === r ? " selected" : ""}`} onClick={() => setEditReason(r)}>{r}</button>
                  ))}
                </div>
              </div>
              <div className="add-dialog-field">
                <span>Detail</span>
                <input type="text" className="add-dialog-input" value={editDetailedReason} onChange={(e) => setEditDetailedReason(limitDetail(e.target.value))} placeholder="Optional note" />
              </div>
            </div>
            <div className="token-dialog-actions">
              <button type="button" onClick={() => updateJourney(editingJourney.id, editDirection, editReason, editDetailedReason)}>Save</button>
              <button type="button" onClick={() => setEditingJourney(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showStats && (
        <div className="token-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowStats(false); }}>
          <div className="token-dialog stats-dialog">
            <div className="token-dialog-header">
              <span>Statistics</span>
              <button type="button" className="token-dialog-close" onClick={() => setShowStats(false)}>×</button>
            </div>
            <div className="stats-charts-scroll">
              <div className="stats-charts">
                <div className="stats-chart">
                  <div className="stats-chart-title">By Operator</div>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={operatorData} cx="44%" cy="50%" outerRadius={70} dataKey="value" isAnimationActive={false} label={false}>
                        {operatorData.map((entry, i) => <Cell key={i} fill={OPERATOR_COLORS[entry.name] ? `#${OPERATOR_COLORS[entry.name]}` : CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number, n) => [`${v} (${(v / operatorData.reduce((s, d) => s + d.value, 0) * 100).toFixed(1)}%)`, n]} />
                      <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 11, paddingLeft: 8 }} formatter={(v: string) => v.length > 16 ? v.slice(0, 15) + "…" : v} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {showPersonalCols && (
                  <div className="stats-chart">
                    <div className="stats-chart-title">By Reason</div>
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie data={reasonData} cx="44%" cy="50%" outerRadius={70} dataKey="value" isAnimationActive={false} label={false}>
                          {reasonData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number, n) => [`${v} (${(v / reasonData.reduce((s, d) => s + d.value, 0) * 100).toFixed(1)}%)`, n]} />
                        <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 11, paddingLeft: 8 }} formatter={(v: string) => v.length > 16 ? v.slice(0, 15) + "…" : v} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div className="stats-chart">
                  <div className="stats-chart-title">Arrival Delay Distribution</div>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={arrivalDelayData} cx="44%" cy="50%" outerRadius={70} dataKey="value" isAnimationActive={false} label={false}>
                        {arrivalDelayData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number, n) => { const t = arrivalDelayData.reduce((s, d) => s + d.value, 0); return [`${v} (${t > 0 ? (v / t * 100).toFixed(1) : 0}%)`, n]; }} />
                      <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 11, paddingLeft: 8 }} formatter={(v: string) => v.length > 16 ? v.slice(0, 15) + "…" : v} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="stats-chart">
                  <div className="stats-chart-title">Journeys by Month</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={monthlyData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
                      <Tooltip labelFormatter={() => ""} separator="" itemStyle={{ color: "#111111" }} formatter={(v: number) => [`${v} (${history.length > 0 ? (v / history.length * 100).toFixed(1) : 0}%)`, ""]} />
                      <Bar dataKey="value" name="Journeys" fill="#e0001b" isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="stats-chart">
                  <div className="stats-chart-title">Top Stations</div>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={topStationsData} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.length > 28 ? v.slice(0, 27) + "…" : v} />
                      <Tooltip labelFormatter={() => ""} separator="" itemStyle={{ color: "#111111" }} formatter={(v: number) => [`${v} (${history.length > 0 ? (v / (history.length * 2) * 100).toFixed(1) : 0}%)`, ""]} />
                      <Bar dataKey="value" name="Journeys" fill="#e0001b" isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
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
              <span>Journey Map</span>
              <button type="button" className="token-dialog-close" onClick={() => setShowMap(false)}>×</button>
            </div>
            <div ref={mapRef} className="map-container" />
            <div className="token-dialog-actions">
              <button type="button" onClick={() => setShowMap(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showOptions && (
        <div className="token-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowOptions(false); }}>
          <div className="token-dialog options-dialog">
            <div className="token-dialog-header">
              <span>Options</span>
              <button type="button" className="token-dialog-close" onClick={() => setShowOptions(false)}>×</button>
            </div>
            <div className="options-body">
              {token && (
                <div className="options-block">
                  <div className="options-row options-split-row">
                    <span>RTT Cookie</span>
                    <button type="button" onClick={() => { setDraftCookie(rttCookie); setShowOptions(false); setShowTokenDialog(true); }} style={{ border: "1px solid #bbbbbb", background: "#fff", padding: "2px 8px", font: "inherit", fontSize: 13 }}>
                      {rttCookie ? "Cookie ✓" : "Set cookie"}
                    </button>
                  </div>
                </div>
              )}
              <div className="options-block">
                <label className="options-row">
                  <input type="checkbox" checked={hidePersonalCols} onChange={(e) => { setHidePersonalCols(e.target.checked); localStorage.setItem("hide_personal_cols", e.target.checked ? "1" : "0"); }} />
                  Hide Dir, Reason and Detailed Reason
                </label>
                <p style={{ margin: "3px 0 0 21px", fontSize: 11, color: "#888", lineHeight: 1.3 }}>These fields are never visible when viewing someone else's journeys.</p>
              </div>
              <div className="options-block">
                <label className="options-row history-date-option">
                  <span className="options-check-label">
                    <input type="checkbox" checked={hideHistoryAfterEnabled} onChange={(e) => { setHideHistoryAfterEnabled(e.target.checked); if (e.target.checked) localStorage.setItem("hide_history_after_enabled", "1"); else localStorage.removeItem("hide_history_after_enabled"); }} />
                    Hide Journey History after date
                  </span>
                  <input type="date" value={hideHistoryAfterDate} onChange={(e) => { setHideHistoryAfterDate(e.target.value); if (e.target.value) localStorage.setItem("hide_history_after_date", e.target.value); else localStorage.removeItem("hide_history_after_date"); }} />
                </label>
                <p style={{ margin: "3px 0 0 0", fontSize: 11, color: "#888", lineHeight: 1.3 }}>Only the table is filtered; statistics and map still use all journeys.</p>
              </div>
            </div>
            <div className="token-dialog-actions">
              <button type="button" onClick={() => setShowOptions(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {canEdit && (
        <JourneySearch
          stations={stations}
          rttCookie={rttCookie}
          authHeaders={authHeaders}
          savedKeys={savedKeys}
          savingId={savingId}
          onMessage={setMessage}
          onAddCandidate={(candidate, searchForm) => {
            setPendingCandidate(candidate);
            setPendingSearchForm(searchForm);
            setAddDirection("Outbound");
            setAddReason("Leisure");
            setAddDetailedReason("");
          }}
        />
      )}

      {message && <div className="message-line" role="status">{message}</div>}

      <section className="table-section">
        <div className="section-title">
          <h2>Journey History <span className="section-count">({activeHideHistoryAfterDate ? `${visibleHistory.length}/${history.length}` : history.length})</span></h2>
          <div style={{ display: "flex", gap: "4px" }}>
            <button type="button" onClick={() => setSortAsc((v) => !v)} title={sortAsc ? "Sort: oldest first" : "Sort: newest first"}>{sortAsc ? "↑ Asc" : "↓ Desc"}</button>
          </div>
        </div>
        <div className="plain-table history-table">
          <table>
            <thead>
              <tr className="table-head">
                <th>Date</th><th>Operator</th><th>From</th><th>To</th><th>Service from</th><th>Service to</th>
                {showPersonalCols && <><th>Dir</th><th>Reason</th><th>Detailed Reason</th></>}
                <th>Dep</th><th>Plat</th><th>Arr</th><th>Plat</th>
                {canEdit && <th></th>}
              </tr>
            </thead>
            <tbody>
              {visibleHistory.length === 0 ? (
                <tr><td colSpan={historyCols} className="empty-row">No journeys.</td></tr>
              ) : visibleHistory.map((item) => (
                <tr className="data-row" key={item.id}>
                  <td>{item.travel_date.replace(/-/g, "")}</td>
                  <td>{item.operator_name ? <OperatorBadge name={item.operator_name} /> : "—"}</td>
                  <td>{stationLabel(item.boarded_crs)}</td>
                  <td>{stationLabel(item.alighted_crs)}</td>
                  <td>{stationLabel(item.service_origin_crs)}</td>
                  <td>{stationLabel(item.service_destination_crs)}</td>
                  {showPersonalCols && <><td>{item.direction ?? "—"}</td><td>{item.reason ?? "—"}</td><td>{item.detailed_reason ?? "—"}</td></>}
                  <td>{timeWithDelay(item.planned_departure, item.departure_lateness_minutes)}</td>
                  <td>{item.platform_departure ?? "—"}</td>
                  <td>{timeWithDelay(item.planned_arrival, item.arrival_lateness_minutes)}</td>
                  <td>{item.platform_arrival ?? "—"}</td>
                  {canEdit && (
                    <td>
                      <div className="row-actions">
                        {item.url && (
                          <button type="button" className="icon-btn" title="Open link" onClick={() => window.open(item.url, "_blank", "noopener,noreferrer")}>
                            <ExternalLink size={13} strokeWidth={1.5} />
                          </button>
                        )}
                        <button type="button" className="icon-btn" title="Edit" onClick={() => { setEditingJourney(item); setEditDirection((item.direction as "Outbound" | "Inbound") ?? "Outbound"); setEditReason((item.reason as "Leisure" | "Work" | "Life" | "Love") ?? "Leisure"); setEditDetailedReason(item.detailed_reason ?? ""); }}>
                          <Pencil size={13} strokeWidth={1.5} />
                        </button>
                        <button type="button" className="icon-btn del-btn" title="Delete" onClick={() => deleteJourney(item.id)}>
                          <Trash2 size={13} strokeWidth={1.5} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
