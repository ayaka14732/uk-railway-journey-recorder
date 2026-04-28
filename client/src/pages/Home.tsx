/*
 * Design reminder: Swiss International Style + SBB passenger-information system.
 * This page must stay dense, red/white/black, sharp-edged, timetable-first, and legible.
 * Every visual choice should reinforce fast railway information scanning rather than decorative cards.
 */
import { FormEvent, useEffect, useMemo, useState } from "react";

type Lang = "zh" | "en" | "fr";

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
  platform?: string;
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
  platformDeparture?: string;
  platformArrival?: string;
  callingPattern?: Array<{
    name: string;
    codes: string[];
    planned?: string;
    actual?: string;
    latenessMinutes?: number | null;
    displayAs?: string;
  }>;
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
  planned_arrival?: string;
  actual_arrival?: string;
  arrival_lateness_minutes?: number | null;
  platform_departure?: string;
  platform_arrival?: string;
};

const copy = {
  zh: {
    app: "UK Rail Ledger",
    strap: "英國鐵路乘坐歷史記錄",
    headline: "高密度乘車台帳",
    summary: "輸入日期、CRS 與接近出發時間，從 Realtime Trains 候選服務中手動選擇車次，解析實際到發與延誤後保存至 SQLite。",
    apiBadge: "RTT API 已接入",
    formTitle: "查詢",
    date: "日期",
    origin: "起始 CRS",
    destination: "終點 CRS",
    time: "時間",
    window: "窗口",
    search: "查詢",
    searching: "查詢中",
    candidates: "候選車次",
    noCandidates: "尚未查詢或未找到候選車次。",
    select: "詳情",
    save: "保存",
    detail: "當前詳情",
    noDetail: "選擇一班車後顯示服務起終點、上下車站、計劃/實際時間、站台與延誤。",
    history: "歷史記錄",
    refresh: "刷新",
    emptyHistory: "沒有保存記錄。",
    departure: "發車",
    arrival: "到站",
    planned: "計劃",
    actual: "實際",
    delay: "延誤",
    platform: "台",
    service: "服務",
    operator: "運營商",
    calling: "停站",
    saved: "已保存到本地 SQLite。",
    tokenTip: "示例：2026-04-27 · MKC → EUS · 18:55",
    action: "操作",
    route: "路線",
    status: "狀態",
    dep: "開",
    arr: "到",
  },
  en: {
    app: "UK Rail Ledger",
    strap: "British rail journey history",
    headline: "Dense journey ledger",
    summary: "Enter date, CRS codes and an approximate departure time, manually pick a Realtime Trains service, parse actual timings and delays, then save to SQLite.",
    apiBadge: "RTT API connected",
    formTitle: "Search",
    date: "Date",
    origin: "Origin CRS",
    destination: "Dest CRS",
    time: "Time",
    window: "Window",
    search: "Search",
    searching: "Searching",
    candidates: "Candidate services",
    noCandidates: "No search yet, or no matching services found.",
    select: "Detail",
    save: "Save",
    detail: "Current detail",
    noDetail: "Choose a train to show endpoints, boarded section, planned/actual times, platforms and delay.",
    history: "Journey history",
    refresh: "Refresh",
    emptyHistory: "No saved journeys.",
    departure: "Departure",
    arrival: "Arrival",
    planned: "Planned",
    actual: "Actual",
    delay: "Delay",
    platform: "Plat",
    service: "Service",
    operator: "Operator",
    calling: "Calling",
    saved: "Saved to local SQLite.",
    tokenTip: "Example: 2026-04-27 · MKC → EUS · 18:55",
    action: "Action",
    route: "Route",
    status: "Status",
    dep: "Dep",
    arr: "Arr",
  },
  fr: {
    app: "UK Rail Ledger",
    strap: "Historique des voyages ferroviaires britanniques",
    headline: "Registre compact des trajets",
    summary: "Saisissez la date, les codes CRS et l’heure approximative, choisissez un service Realtime Trains, puis enregistrez horaires réels et retards dans SQLite.",
    apiBadge: "API RTT connectée",
    formTitle: "Recherche",
    date: "Date",
    origin: "CRS départ",
    destination: "CRS arrivée",
    time: "Heure",
    window: "Fenêtre",
    search: "Chercher",
    searching: "Recherche",
    candidates: "Services candidats",
    noCandidates: "Aucune recherche ou aucun service trouvé.",
    select: "Détail",
    save: "Enregistrer",
    detail: "Détail courant",
    noDetail: "Choisissez un train pour afficher terminus, tronçon, horaires, voies et retards.",
    history: "Historique",
    refresh: "Actualiser",
    emptyHistory: "Aucun voyage enregistré.",
    departure: "Départ",
    arrival: "Arrivée",
    planned: "Prévu",
    actual: "Réel",
    delay: "Retard",
    platform: "Voie",
    service: "Service",
    operator: "Opérateur",
    calling: "Arrêts",
    saved: "Enregistré dans SQLite local.",
    tokenTip: "Exemple : 2026-04-27 · MKC → EUS · 18:55",
    action: "Action",
    route: "Route",
    status: "État",
    dep: "Dép",
    arr: "Arr",
  },
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
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body.detail === "string" ? body.detail : body.detail?.message || response.statusText;
    throw new Error(detail);
  }
  return body as T;
}

export default function Home() {
  const [lang, setLang] = useState<Lang>("zh");
  const t = copy[lang];
  const [form, setForm] = useState<SearchForm>({
    travelDate: "2026-04-27",
    originCrs: "MKC",
    destinationCrs: "EUS",
    time: "18:55",
    windowMinutes: 150,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [detail, setDetail] = useState<JourneyDetail | null>(null);
  const [history, setHistory] = useState<StoredJourney[]>([]);

  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.identity === selected),
    [candidates, selected],
  );

  async function loadHistory() {
    try {
      const data = await apiJson<{ journeys: StoredJourney[] }>("/api/journeys?limit=40");
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
    setDetail(null);
    setSelected("");
    try {
      const data = await apiJson<{ candidates: Candidate[] }>("/api/search-services", {
        method: "POST",
        body: JSON.stringify({ ...form, originCrs: form.originCrs.toUpperCase(), destinationCrs: form.destinationCrs.toUpperCase() }),
      });
      setCandidates(data.candidates);
      if (!data.candidates.length) setMessage(t.noCandidates);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function resolve(candidate: Candidate, save = false) {
    setSelected(candidate.identity);
    setSaving(save);
    setMessage("");
    try {
      const data = await apiJson<{ journeyId: number | null; detail: JourneyDetail }>("/api/resolve-service", {
        method: "POST",
        body: JSON.stringify({
          travelDate: form.travelDate,
          originCrs: form.originCrs.toUpperCase(),
          destinationCrs: form.destinationCrs.toUpperCase(),
          identity: candidate.identity,
          departureDate: candidate.departureDate || form.travelDate,
          save,
        }),
      });
      setDetail(data.detail);
      if (save) {
        setMessage(t.saved);
        await loadHistory();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="sbb-shell dense-shell">
      <header className="sbb-topbar compact-topbar">
        <div className="brand-block compact-brand">
          <div className="sbb-mark">SBB</div>
          <div>
            <strong>{t.app}</strong>
            <span>{t.strap}</span>
          </div>
        </div>
        <div className="top-summary">
          <b>{t.headline}</b>
          <span>{t.summary}</span>
        </div>
        <div className="lang-switch" aria-label="Language selector">
          {(["zh", "en", "fr"] as Lang[]).map((item) => (
            <button key={item} className={lang === item ? "active" : ""} onClick={() => setLang(item)}>
              {item === "zh" ? "繁" : item.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <section className="control-strip">
        <div className="api-ribbon">{t.apiBadge}</div>
        <form className="dense-query" onSubmit={search}>
          <label>{t.date}<input type="date" value={form.travelDate} onChange={(e) => setForm({ ...form, travelDate: e.target.value })} /></label>
          <label>{t.origin}<input value={form.originCrs} maxLength={8} onChange={(e) => setForm({ ...form, originCrs: e.target.value.toUpperCase() })} /></label>
          <label>{t.destination}<input value={form.destinationCrs} maxLength={8} onChange={(e) => setForm({ ...form, destinationCrs: e.target.value.toUpperCase() })} /></label>
          <label>{t.time}<input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></label>
          <label>{t.window}<select value={form.windowMinutes} onChange={(e) => setForm({ ...form, windowMinutes: Number(e.target.value) })}>
            <option value={60}>60</option>
            <option value={120}>120</option>
            <option value={150}>150</option>
            <option value={240}>240</option>
          </select></label>
          <button className="sbb-primary compact-submit" disabled={loading}>{loading ? t.searching : t.search}</button>
        </form>
        <div className="example-line">{t.tokenTip}</div>
      </section>

      {message && <div className="status-line">{message}</div>}

      <section className="dense-board">
        <section className="dense-panel candidates-panel">
          <PanelHeading index="01" title={t.candidates} meta={`${candidates.length}`} />
          <div className="dense-table service-table">
            <div className="table-head service-row-grid">
              <span>{t.dep}</span><span>{t.service}</span><span>{t.route}</span><span>{t.operator}</span><span>{t.platform}</span><span>{t.delay}</span><span>{t.action}</span>
            </div>
            {candidates.length === 0 ? (
              <div className="empty-line">{t.noCandidates}</div>
            ) : candidates.map((candidate) => (
              <article key={`${candidate.identity}-${candidate.departureDate}`} className={selected === candidate.identity ? "data-row selected service-row-grid" : "data-row service-row-grid"}>
                <strong className="mono-time">{timeOnly(candidate.departureDisplay || candidate.plannedDeparture)}</strong>
                <span className="mono-code">{candidate.identity} / {candidate.trainReportingIdentity || "—"}</span>
                <span className="truncate">{candidate.serviceOrigin || "—"} → {candidate.serviceDestination || "—"}</span>
                <span className="truncate">{candidate.operatorName || candidate.operatorCode || "—"}</span>
                <span>{candidate.platform || "—"}</span>
                <b className={delayClass(candidate.departureLatenessMinutes)}>{delayText(candidate.departureLatenessMinutes)}</b>
                <span className="inline-actions">
                  <button type="button" onClick={() => resolve(candidate, false)}>{t.select}</button>
                  <button type="button" onClick={() => resolve(candidate, true)} disabled={saving && selected === candidate.identity}>{t.save}</button>
                </span>
              </article>
            ))}
          </div>
        </section>

        <section className="dense-panel detail-panel-compact">
          <PanelHeading index="02" title={t.detail} meta={selectedCandidate?.identity || "—"} />
          {!detail ? (
            <div className="empty-line tall">{t.noDetail}</div>
          ) : (
            <div className="detail-ledger">
              <div className="journey-compact-row">
                <span className="station-code">{detail.boarded.crs}</span>
                <strong className="truncate">{detail.boarded.name}</strong>
                <span className="arrow-cell">→</span>
                <span className="station-code">{detail.alighted.crs}</span>
                <strong className="truncate">{detail.alighted.name}</strong>
              </div>
              <div className="detail-metrics-row">
                <MetricLine title={t.departure} planned={timeOnly(detail.plannedDeparture)} actual={timeOnly(detail.actualDeparture || detail.departureDisplay)} delay={detail.departureLatenessMinutes} platform={detail.platformDeparture} t={t} />
                <MetricLine title={t.arrival} planned={timeOnly(detail.plannedArrival)} actual={timeOnly(detail.actualArrival || detail.arrivalDisplay)} delay={detail.arrivalLatenessMinutes} platform={detail.platformArrival} t={t} />
              </div>
              <div className="meta-line">
                <span>{t.service}: <b>{detail.serviceOrigin} → {detail.serviceDestination}</b></span>
                <span>{t.operator}: <b>{detail.operatorName || selectedCandidate?.operatorName || "—"}</b></span>
              </div>
              <div className="calling-compact">
                <div className="table-head calling-row-grid"><span>#</span><span>{t.calling}</span><span>{t.actual}</span><span>{t.delay}</span></div>
                {(detail.callingPattern || []).slice(0, 22).map((stop, index) => (
                  <div className="data-row calling-row-grid" key={`${stop.name}-${index}`}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong className="truncate">{stop.name}</strong>
                    <span className="mono-time">{stop.actual || stop.planned || "—"}</span>
                    <b className={delayClass(stop.latenessMinutes)}>{delayText(stop.latenessMinutes)}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="dense-panel history-panel-compact">
          <PanelHeading index="03" title={t.history} meta={`${history.length}`} action={<button onClick={loadHistory}>{t.refresh}</button>} />
          <div className="dense-table history-table">
            <div className="table-head history-row-grid"><span>{t.date}</span><span>{t.route}</span><span>{t.service}</span><span>{t.dep}</span><span>{t.arr}</span><span>{t.delay}</span></div>
            {history.length === 0 ? (
              <div className="empty-line">{t.emptyHistory}</div>
            ) : history.map((item) => (
              <div className="data-row history-row-grid" key={item.id}>
                <span>{item.travel_date}</span>
                <strong>{item.boarded_crs} → {item.alighted_crs}</strong>
                <span className="truncate">{item.train_reporting_identity || item.service_identity} · {item.operator_name || "—"}</span>
                <span>{timeOnly(item.actual_departure || item.planned_departure)} <em>{delayText(item.departure_lateness_minutes)}</em></span>
                <span>{timeOnly(item.actual_arrival || item.planned_arrival)}</span>
                <b className={delayClass(item.arrival_lateness_minutes)}>{delayText(item.arrival_lateness_minutes)}</b>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function PanelHeading({ index, title, meta, action }: { index: string; title: string; meta?: string; action?: React.ReactNode }) {
  return (
    <div className="panel-heading dense-heading">
      <span>{index}</span>
      <h2>{title}</h2>
      {meta && <b>{meta}</b>}
      {action && <div className="heading-action">{action}</div>}
    </div>
  );
}

function MetricLine({ title, planned, actual, delay, platform, t }: { title: string; planned: string; actual: string; delay?: number | null; platform?: string; t: typeof copy[Lang] }) {
  return (
    <div className="metric-line">
      <span>{title}</span>
      <strong>{actual}</strong>
      <em>{t.planned} {planned}</em>
      <b className={delayClass(delay)}>{t.delay} {delayText(delay)}</b>
      <i>{t.platform} {platform || "—"}</i>
    </div>
  );
}
