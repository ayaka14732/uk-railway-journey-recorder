/*
 * Design reminder: Plain SBB-inspired utility interface.
 * Keep the page English-only, simple, compact, red/black/white, and table-first.
 * Avoid decorative imagery, animation, language switching, platform fields, and detail panels.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Download, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { ApiError, apiJson } from "@/lib/api";
import { OPERATOR_COLORS, OPERATOR_DETAILS, OPERATOR_NAMES, OperatorBadge, normaliseOperator, operatorTextColor } from "@/lib/operators";
import { auth } from "@/lib/auth";
import { publicAsset } from "@/lib/assets";
import { localDateString } from "@/lib/utils";
import { isValidUsername } from "@/lib/username";
import AddJourneyDialog from "@/components/AddJourneyDialog";
import AnchoredTooltip from "@/components/AnchoredTooltip";
import EditJourneyDialog, { type EditableJourney } from "@/components/EditJourneyDialog";
import { type Direction, type Reason } from "@/components/JourneyMetaDialog";
import { type Candidate, type SearchForm, type Station } from "@/components/JourneySearch";
import NewJourneyDialog from "@/components/NewJourneyDialog";
import NotFound from "./NotFound";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type StoredJourney = {
  id: number;
  travel_date: string;
  departure_date?: string;
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
  direction?: Direction;
  reason?: Reason;
  detailed_reason?: string;
};

type PendingAdd = {
  candidate: Candidate;
  searchForm: SearchForm;
};

const CHART_COLORS = ["#e0001b", "#111111", "#5b6b7a", "#8faa80", "#e8a838", "#6b8cba", "#cc7a52", "#aaaaaa"];

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

  const [message, setMessage] = useState<string>("");
  const [history, setHistory] = useState<StoredJourney[]>([]);
  const [sortAsc, setSortAsc] = useState(false);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(() => new Set());
  const savedKeyById = useRef<Map<number, string>>(new Map());
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);

  const [notFound, setNotFound] = useState(false);
  const [showJourneySearch, setShowJourneySearch] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [hidePersonalCols, setHidePersonalCols] = useState(() => localStorage.getItem("hide_personal_cols") === "1");
  const [hideHistoryAfterEnabled, setHideHistoryAfterEnabled] = useState(() => localStorage.getItem("hide_history_after_enabled") === "1");
  const [hideHistoryAfterDate, setHideHistoryAfterDate] = useState(() => localStorage.getItem("hide_history_after_date") ?? "");
  const mapRef = useRef<HTMLDivElement>(null);
  const [editingJourney, setEditingJourney] = useState<EditableJourney | null>(null);
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

  const tocCoverageData = useMemo(() => {
    const riddenOperators = new Set<string>();
    for (const j of history) {
      if (!j.operator_name) continue;
      const key = normaliseOperator(j.operator_name);
      if (!OPERATOR_NAMES.has(key)) continue;
      riddenOperators.add(key);
    }
    const all = OPERATOR_DETAILS.map((operator) => ({
      ...operator,
      ridden: riddenOperators.has(operator.name),
    }));
    return {
      ridden: all.filter((toc) => toc.ridden),
      unridden: all.filter((toc) => !toc.ridden),
    };
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

  function exportCsv() {
    const headers = [
      "Date", "Operator",
      "From CRS", "From Station", "To CRS", "To Station",
      "Service From CRS", "Service From Station", "Service To CRS", "Service To Station",
      "Direction", "Reason", "Detailed Reason",
      "Planned Departure", "Departure Delay (min)", "Departure Platform",
      "Planned Arrival", "Arrival Delay (min)", "Arrival Platform",
      "URL",
    ];
    function esc(v: string | number | undefined | null): string {
      if (v == null) return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    }
    const rows = [headers.join(",")];
    for (const j of sortedHistory) {
      rows.push([
        j.travel_date, j.operator_name ?? "",
        j.boarded_crs, stationMap.get(j.boarded_crs) ?? "",
        j.alighted_crs, stationMap.get(j.alighted_crs) ?? "",
        j.service_origin_crs ?? "", j.service_origin_crs ? (stationMap.get(j.service_origin_crs) ?? "") : "",
        j.service_destination_crs ?? "", j.service_destination_crs ? (stationMap.get(j.service_destination_crs) ?? "") : "",
        j.direction ?? "", j.reason ?? "", j.detailed_reason ?? "",
        timeOnly(j.planned_departure), j.departure_lateness_minutes ?? "", j.platform_departure ?? "",
        timeOnly(j.planned_arrival), j.arrival_lateness_minutes ?? "", j.platform_arrival ?? "",
        j.url ?? "",
      ].map(esc).join(","));
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${username}-journeys-${localDateString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function stationLabel(crs?: string): string {
    if (!crs) return "—";
    const name = stationMap.get(crs);
    return name ? `${name} (${crs})` : crs;
  }

  function tocChipStyle(hex: string): CSSProperties {
    return { backgroundColor: `#${hex}`, color: operatorTextColor(hex) };
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

  async function deleteJourney(id: number) {
    setMessage("");
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

      {canEdit && pendingAdd && (
        <AddJourneyDialog
          candidate={pendingAdd.candidate}
          searchForm={pendingAdd.searchForm}
          rttCookie={rttCookie}
          authHeaders={authHeaders}
          onClose={() => setPendingAdd(null)}
          onAdded={(savedKey, journeyId, detail, values) => {
            setSavedKeys((prev) => new Set(prev).add(savedKey));
            if (journeyId !== null) savedKeyById.current.set(journeyId, savedKey);
            if (journeyId !== null) {
              setHistory((prev) => [{
                id: journeyId,
                travel_date: detail.travelDate,
                boarded_crs: detail.boarded.crs,
                alighted_crs: detail.alighted.crs,
                departure_date: detail.departureDate,
                operator_name: detail.operatorName,
                service_origin_crs: detail.serviceOriginCrs,
                service_destination_crs: detail.serviceDestinationCrs,
                planned_departure: detail.plannedDeparture,
                departure_lateness_minutes: detail.departureLatenessMinutes,
                platform_departure: detail.platformDeparture,
                planned_arrival: detail.plannedArrival,
                arrival_lateness_minutes: detail.arrivalLatenessMinutes,
                platform_arrival: detail.platformArrival,
                direction: values.direction,
                reason: values.reason,
                detailed_reason: values.detailedReason,
                url: detail.url,
              }, ...prev]);
            }
            setPendingAdd(null);
            setShowJourneySearch(false);
          }}
        />
      )}

      {canEdit && editingJourney && (
        <EditJourneyDialog
          journey={editingJourney}
          authHeaders={authHeaders}
          onClose={() => setEditingJourney(null)}
          onSaved={(id, values) => {
            setHistory((prev) => prev.map((j) => j.id === id ? { ...j, direction: values.direction, reason: values.reason, detailed_reason: values.detailedReason } : j));
            setEditingJourney(null);
          }}
        />
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
                <div className="stats-chart">
                  <div className="stats-chart-title">TOC Coverage</div>
                  <div className="toc-chip-list">
                    {tocCoverageData.ridden.map((toc) => (
                      <AnchoredTooltip key={toc.name} id={`toc-tip-${toc.code}`} label={toc.name}>
                        {(triggerProps) => (
                          <button
                            type="button"
                            className="toc-chip toc-chip-ridden"
                            style={tocChipStyle(toc.color)}
                            aria-label={toc.name}
                            {...triggerProps}
                          >
                            {toc.code}
                          </button>
                        )}
                      </AnchoredTooltip>
                    ))}
                    {tocCoverageData.unridden.map((toc) => (
                      <AnchoredTooltip key={toc.name} id={`toc-tip-${toc.code}`} label={toc.name}>
                        {(triggerProps) => (
                          <button
                            type="button"
                            className="toc-chip toc-chip-unridden"
                            aria-label={toc.name}
                            {...triggerProps}
                          >
                            {toc.code}
                          </button>
                        )}
                      </AnchoredTooltip>
                    ))}
                  </div>
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
                <p style={{ margin: "3px 0 0 0", fontSize: 11, color: "#888", lineHeight: 1.3 }}>Only the table is filtered. Statistics, map and CSV export still use all journeys.</p>
              </div>
            </div>
            <div className="token-dialog-actions">
              <button type="button" onClick={() => setShowOptions(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {canEdit && showJourneySearch && (
        <NewJourneyDialog
          stations={stations}
          rttCookie={rttCookie}
          authHeaders={authHeaders}
          savedKeys={savedKeys}
          onClose={() => setShowJourneySearch(false)}
          onAddCandidate={(candidate, searchForm) => {
            setPendingAdd({ candidate, searchForm });
          }}
        />
      )}

      {message && <div className="message-line" role="status">{message}</div>}

      <section className="table-section">
        <div className="section-title">
          <h2>Journey History <span className="section-count">({activeHideHistoryAfterDate ? `${visibleHistory.length}/${history.length}` : history.length})</span></h2>
          <div style={{ display: "flex", gap: "4px" }}>
            <button type="button" className="icon-btn" title="Export CSV" onClick={exportCsv} disabled={sortedHistory.length === 0}><Download size={14} strokeWidth={1.5} /></button>
            {canEdit && <button type="button" className="icon-btn" title="Add journey" onClick={() => setShowJourneySearch(true)}><Plus size={14} strokeWidth={1.5} /></button>}
          </div>
        </div>
        <div className="plain-table history-table">
          <table>
            <thead>
              <tr className="table-head">
                <th>
                  <div className="sortable-th">
                    <span>Date</span>
                    <button type="button" className="th-sort-btn" onClick={() => setSortAsc((v) => !v)} title={sortAsc ? "Sort: oldest first" : "Sort: newest first"} aria-label={sortAsc ? "Sort: oldest first" : "Sort: newest first"}>
                      <span className="sort-triangles" aria-hidden="true">
                        <span className={sortAsc ? "active" : ""}>▲</span>
                        <span className={sortAsc ? "" : "active"}>▼</span>
                      </span>
                    </button>
                  </div>
                </th><th>Operator</th><th>From</th><th>To</th><th>Service from</th><th>Service to</th>
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
                        <button type="button" className="icon-btn" title="Edit" onClick={() => setEditingJourney({
                          id: item.id,
                          direction: item.direction,
                          reason: item.reason,
                          detailed_reason: item.detailed_reason ?? "",
                        })}>
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
