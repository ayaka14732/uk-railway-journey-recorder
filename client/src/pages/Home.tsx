/*
 * Design reminder: Plain SBB-inspired utility interface.
 * Keep the page English-only, simple, compact, red/black/white, and table-first.
 * Avoid decorative imagery, animation, language switching, platform fields, and detail panels.
 */
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

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
  serviceOrigin?: string;
  serviceDestination?: string;
  plannedDeparture?: string;
  actualDeparture?: string;
  departureDisplay?: string;
  departureLatenessMinutes?: number | null;
  plannedArrival?: string;
  actualArrival?: string;
  arrivalDisplay?: string;
  arrivalLatenessMinutes?: number | null;
  isCancelled?: boolean;
};

type JourneyDetail = {
  identity?: string;
  departureDate?: string;
  trainReportingIdentity?: string;
  operatorName?: string;
  serviceOrigin?: string;
  serviceDestination?: string;
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
  service_origin_name?: string;
  service_destination_name?: string;
  planned_departure?: string;
  actual_departure?: string;
  departure_lateness_minutes?: number | null;
  platform_departure?: string | null;
  planned_arrival?: string;
  actual_arrival?: string;
  arrival_lateness_minutes?: number | null;
  platform_arrival?: string | null;
};

const DEFAULT_FORM: SearchForm = {
  travelDate: "2026-04-27",
  originCrs: "MKC",
  destinationCrs: "EUS",
  time: "18:55",
  windowMinutes: 150,
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

  const candidateCount = useMemo(() => candidates.length, [candidates]);

  async function loadHistory() {
    try {
      const data = await apiJson<{ journeys: StoredJourney[] }>("/api/journeys?limit=80");
      setHistory(data.journeys);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    loadHistory();
  }, []);

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

  async function addJourney(candidate: Candidate) {
    setSavingId(candidate.identity);
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
        <p>Search Realtime Trains services and add journeys directly to the local history database.</p>
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

      <section className="search-panel">
        <form className="search-form" onSubmit={search}>
          <label>Date<input type="date" value={form.travelDate} onChange={(event) => setForm({ ...form, travelDate: event.target.value })} /></label>
          <label>From<input value={form.originCrs} maxLength={8} onChange={(event) => setForm({ ...form, originCrs: event.target.value.toUpperCase() })} /></label>
          <label>To<input value={form.destinationCrs} maxLength={8} onChange={(event) => setForm({ ...form, destinationCrs: event.target.value.toUpperCase() })} /></label>
          <label>Near<input type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} /></label>
          <label>Window<select value={form.windowMinutes} onChange={(event) => setForm({ ...form, windowMinutes: Number(event.target.value) })}>
            <option value={60}>60 min</option>
            <option value={120}>120 min</option>
            <option value={150}>150 min</option>
            <option value={240}>240 min</option>
          </select></label>
          <button type="submit" disabled={loading}>{loading ? "Searching" : "Search"}</button>
        </form>
        <div className="hint-line">Example: 2026-04-27, MKC to EUS, near 18:55.</div>
      </section>

      {message && <div className="message-line" role="status">{message}</div>}

      <section className="table-section">
        <div className="section-title"><h2>Candidate services</h2><span>{candidateCount} rows</span></div>
        <div className="plain-table candidate-table">
          <div className="table-head candidate-row">
            <span>Service</span><span>Route</span><span>Operator</span><span>Booked dep</span><span>Actual dep</span><span>Dep delay</span><span>Booked arr</span><span>Actual arr</span><span>Arr delay</span><span>Action</span>
          </div>
          {candidates.length === 0 ? (
            <div className="empty-row">No search results yet.</div>
          ) : candidates.map((candidate) => {
            const key = `${candidate.identity}-${candidate.departureDate}`;
            const saved = savedKeys.has(key);
            return (
              <div className="data-row candidate-row" key={key}>
                <strong>{candidate.trainReportingIdentity || candidate.identity}</strong>
                <span className="truncate">{candidate.serviceOrigin || form.originCrs} to {candidate.serviceDestination || form.destinationCrs}</span>
                <span className="truncate">{candidate.operatorName || candidate.operatorCode || "—"}</span>
                <span>{timeOnly(candidate.plannedDeparture)}</span>
                <span>{timeOnly(candidate.actualDeparture || candidate.departureDisplay)}</span>
                <b className={delayClass(candidate.departureLatenessMinutes)}>{delayText(candidate.departureLatenessMinutes)}</b>
                <span>{timeOnly(candidate.plannedArrival)}</span>
                <span>{timeOnly(candidate.actualArrival || candidate.arrivalDisplay)}</span>
                <b className={delayClass(candidate.arrivalLatenessMinutes)}>{delayText(candidate.arrivalLatenessMinutes)}</b>
                <button type="button" onClick={() => addJourney(candidate)} disabled={savingId === candidate.identity || saved}>{saved ? "Added" : savingId === candidate.identity ? "Adding" : "Add"}</button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="table-section">
        <div className="section-title"><h2>Journey history</h2><button type="button" onClick={loadHistory}>Refresh</button></div>
        <div className="plain-table history-table">
          <div className="table-head history-row">
            <span>Date</span><span>Journey</span><span>Service</span><span>Dep plat</span><span>Booked dep</span><span>Actual dep</span><span>Dep delay</span><span>Arr plat</span><span>Booked arr</span><span>Actual arr</span><span>Arr delay</span>
          </div>
          {history.length === 0 ? (
            <div className="empty-row">No journeys saved.</div>
          ) : history.map((item) => (
            <div className="data-row history-row" key={item.id}>
              <span>{item.travel_date}</span>
              <strong>{item.boarded_crs} to {item.alighted_crs}</strong>
              <span className="truncate">{item.train_reporting_identity || item.service_identity} · {item.operator_name || "—"}</span>
              <span>{item.platform_departure ?? "—"}</span>
              <span>{timeOnly(item.planned_departure)}</span>
              <span>{timeOnly(item.actual_departure)}</span>
              <b className={delayClass(item.departure_lateness_minutes)}>{delayText(item.departure_lateness_minutes)}</b>
              <span>{item.platform_arrival ?? "—"}</span>
              <span>{timeOnly(item.planned_arrival)}</span>
              <span>{timeOnly(item.actual_arrival)}</span>
              <b className={delayClass(item.arrival_lateness_minutes)}>{delayText(item.arrival_lateness_minutes)}</b>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
