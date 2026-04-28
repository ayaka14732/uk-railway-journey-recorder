/*
 * Design reminder: Swiss International Style + SBB passenger-information system.
 * This page must stay dense, red/white/black, sharp-edged, timetable-first, and legible.
 * Every visual choice should reinforce fast railway information scanning rather than decorative cards.
 */
import { FormEvent, useEffect, useMemo, useState } from "react";

const HERO_IMAGE = "/manus-storage/sbb-rail-ledger-hero_9651f47f.png";
const DETAIL_IMAGE = "/manus-storage/sbb-delay-timetable-detail_564e29f8.png";
const EMPTY_IMAGE = "/manus-storage/sbb-empty-history-marker_6dcdcb72.png";

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
    heroTitle: "用時刻表方式記錄每一次英國鐵路乘車。",
    heroBody: "輸入日期、起訖站與接近的出發時間，從 Realtime Trains 候選服務中手動選擇車次，系統會解析服務起終點、乘坐區間、實際時間與延誤分鐘，並可保存到 SQLite。",
    apiBadge: "RTT API 代理已接入",
    formTitle: "查詢車次",
    date: "日期",
    origin: "起始站 CRS",
    destination: "終點站 CRS",
    time: "接近出發時間",
    window: "搜尋窗口",
    search: "查詢候選車次",
    searching: "查詢中",
    example: "示例已預填：2026-04-27，MKC → EUS，18:55。",
    candidates: "候選車次",
    noCandidates: "尚未查詢或未找到候選車次。",
    select: "查看詳情",
    save: "保存記錄",
    detail: "行程詳情",
    noDetail: "選擇一班車後，這裡會顯示起點、終點、上下車站、實際到發與延誤資訊。",
    history: "已保存歷史",
    refresh: "刷新歷史",
    emptyHistory: "還沒有保存記錄。",
    departure: "發車",
    arrival: "到站",
    planned: "計劃",
    actual: "實際",
    delay: "延誤",
    platform: "站台",
    service: "服務",
    operator: "運營商",
    calling: "停站模式",
    saved: "已保存到本地 SQLite。",
    tokenTip: "如果看到 token 錯誤，請在 backend/.env 或 shell 中設置 RTT_API_TOKEN。",
  },
  en: {
    app: "UK Rail Ledger",
    strap: "British rail journey history",
    heroTitle: "Record UK rail journeys in the language of a working timetable.",
    heroBody: "Enter a date, origin, destination and approximate departure time, manually choose the Realtime Trains service, then capture origin, destination, boarded section, actual timings and delay minutes into SQLite.",
    apiBadge: "RTT API proxy connected",
    formTitle: "Search service",
    date: "Date",
    origin: "Origin CRS",
    destination: "Destination CRS",
    time: "Approx departure",
    window: "Search window",
    search: "Find candidate services",
    searching: "Searching",
    example: "Example prefilled: 2026-04-27, MKC → EUS, 18:55.",
    candidates: "Candidate services",
    noCandidates: "No search yet, or no matching services found.",
    select: "View detail",
    save: "Save record",
    detail: "Journey detail",
    noDetail: "Choose a train to see service endpoints, boarded section, actual timings and delay information.",
    history: "Saved history",
    refresh: "Refresh history",
    emptyHistory: "No saved journeys yet.",
    departure: "Departure",
    arrival: "Arrival",
    planned: "Planned",
    actual: "Actual",
    delay: "Delay",
    platform: "Platform",
    service: "Service",
    operator: "Operator",
    calling: "Calling pattern",
    saved: "Saved to local SQLite.",
    tokenTip: "If a token error appears, set RTT_API_TOKEN in backend/.env or the shell environment.",
  },
  fr: {
    app: "UK Rail Ledger",
    strap: "Historique des voyages ferroviaires britanniques",
    heroTitle: "Enregistrer les voyages britanniques avec la rigueur d’un horaire ferroviaire.",
    heroBody: "Saisissez la date, les gares et l’heure approximative, choisissez manuellement le service Realtime Trains, puis enregistrez l’origine, la destination, le tronçon, les horaires réels et les retards dans SQLite.",
    apiBadge: "Proxy RTT API connecté",
    formTitle: "Rechercher un train",
    date: "Date",
    origin: "CRS départ",
    destination: "CRS arrivée",
    time: "Départ approx.",
    window: "Fenêtre",
    search: "Trouver les services",
    searching: "Recherche",
    example: "Exemple prérempli : 2026-04-27, MKC → EUS, 18:55.",
    candidates: "Services candidats",
    noCandidates: "Aucune recherche ou aucun service trouvé.",
    select: "Voir détail",
    save: "Enregistrer",
    detail: "Détail du voyage",
    noDetail: "Choisissez un train pour voir les terminus, le tronçon, les horaires réels et les retards.",
    history: "Historique enregistré",
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
    tokenTip: "En cas d’erreur de token, définissez RTT_API_TOKEN dans backend/.env ou dans le shell.",
  },
};

function delayText(value?: number | null) {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "RT";
  return value > 0 ? `+${value} min` : `${value} min`;
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
      const data = await apiJson<{ journeys: StoredJourney[] }>("/api/journeys?limit=20");
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
    <main className="sbb-shell">
      <header className="sbb-topbar">
        <div className="brand-block">
          <div className="sbb-mark">SBB</div>
          <div>
            <strong>{t.app}</strong>
            <span>{t.strap}</span>
          </div>
        </div>
        <div className="lang-switch" aria-label="Language selector">
          {(["zh", "en", "fr"] as Lang[]).map((item) => (
            <button key={item} className={lang === item ? "active" : ""} onClick={() => setLang(item)}>
              {item === "zh" ? "繁" : item.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <section className="hero-grid">
        <div className="hero-copy">
          <div className="api-ribbon">{t.apiBadge}</div>
          <h1>{t.heroTitle}</h1>
          <p>{t.heroBody}</p>
          <p className="config-note">{t.tokenTip}</p>
        </div>
        <img src={HERO_IMAGE} alt="SBB inspired rail ledger graphic" />
      </section>

      <section className="workbench">
        <form className="query-panel" onSubmit={search}>
          <div className="panel-heading">
            <span>01</span>
            <h2>{t.formTitle}</h2>
          </div>
          <div className="field-grid">
            <label>
              {t.date}
              <input type="date" value={form.travelDate} onChange={(e) => setForm({ ...form, travelDate: e.target.value })} />
            </label>
            <label>
              {t.origin}
              <input value={form.originCrs} maxLength={8} onChange={(e) => setForm({ ...form, originCrs: e.target.value.toUpperCase() })} />
            </label>
            <label>
              {t.destination}
              <input value={form.destinationCrs} maxLength={8} onChange={(e) => setForm({ ...form, destinationCrs: e.target.value.toUpperCase() })} />
            </label>
            <label>
              {t.time}
              <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </label>
            <label>
              {t.window}
              <select value={form.windowMinutes} onChange={(e) => setForm({ ...form, windowMinutes: Number(e.target.value) })}>
                <option value={60}>60 min</option>
                <option value={120}>120 min</option>
                <option value={150}>150 min</option>
                <option value={240}>240 min</option>
              </select>
            </label>
          </div>
          <button className="sbb-primary" disabled={loading}>{loading ? t.searching : t.search}</button>
          <p className="fine-print">{t.example}</p>
        </form>

        <section className="candidate-panel">
          <div className="panel-heading">
            <span>02</span>
            <h2>{t.candidates}</h2>
          </div>
          {candidates.length === 0 ? (
            <div className="empty-state">
              <img src={EMPTY_IMAGE} alt="Empty railway marker" />
              <p>{t.noCandidates}</p>
            </div>
          ) : (
            <div className="service-list">
              {candidates.map((candidate) => (
                <article key={`${candidate.identity}-${candidate.departureDate}`} className={selected === candidate.identity ? "service-row selected" : "service-row"}>
                  <div className="time-cell">{timeOnly(candidate.departureDisplay || candidate.plannedDeparture)}</div>
                  <div className="route-cell">
                    <strong>{candidate.serviceOrigin} → {candidate.serviceDestination}</strong>
                    <span>{candidate.operatorName || candidate.operatorCode || "—"} · {candidate.identity} · {candidate.trainReportingIdentity || "—"}</span>
                  </div>
                  <div className={`delay-pill ${delayClass(candidate.departureLatenessMinutes)}`}>{delayText(candidate.departureLatenessMinutes)}</div>
                  <div className="row-actions">
                    <button type="button" onClick={() => resolve(candidate, false)}>{t.select}</button>
                    <button type="button" onClick={() => resolve(candidate, true)} disabled={saving && selected === candidate.identity}>{t.save}</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      {message && <div className="status-line">{message}</div>}

      <section className="detail-history-grid">
        <section className="detail-panel">
          <div className="panel-heading">
            <span>03</span>
            <h2>{t.detail}</h2>
          </div>
          {!detail ? (
            <div className="detail-placeholder">
              <img src={DETAIL_IMAGE} alt="Timetable detail illustration" />
              <p>{t.noDetail}</p>
            </div>
          ) : (
            <>
              <div className="journey-title">
                <div>
                  <span>{detail.boarded.crs}</span>
                  <strong>{detail.boarded.name}</strong>
                </div>
                <b>→</b>
                <div>
                  <span>{detail.alighted.crs}</span>
                  <strong>{detail.alighted.name}</strong>
                </div>
              </div>
              <div className="metrics-grid">
                <Metric label={t.departure} planned={timeOnly(detail.plannedDeparture)} actual={timeOnly(detail.actualDeparture || detail.departureDisplay)} delay={detail.departureLatenessMinutes} platform={detail.platformDeparture} t={t} />
                <Metric label={t.arrival} planned={timeOnly(detail.plannedArrival)} actual={timeOnly(detail.actualArrival || detail.arrivalDisplay)} delay={detail.arrivalLatenessMinutes} platform={detail.platformArrival} t={t} />
              </div>
              <dl className="service-meta">
                <div><dt>{t.service}</dt><dd>{detail.serviceOrigin} → {detail.serviceDestination}</dd></div>
                <div><dt>{t.operator}</dt><dd>{detail.operatorName || selectedCandidate?.operatorName || "—"}</dd></div>
              </dl>
              <div className="calling-pattern">
                <h3>{t.calling}</h3>
                {(detail.callingPattern || []).slice(0, 18).map((stop, index) => (
                  <div className="calling-row" key={`${stop.name}-${index}`}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{stop.name}</strong>
                    <em>{stop.actual || stop.planned || "—"}</em>
                    <b className={delayClass(stop.latenessMinutes)}>{delayText(stop.latenessMinutes)}</b>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="history-panel">
          <div className="panel-heading with-action">
            <div><span>04</span><h2>{t.history}</h2></div>
            <button onClick={loadHistory}>{t.refresh}</button>
          </div>
          {history.length === 0 ? (
            <p className="fine-print">{t.emptyHistory}</p>
          ) : (
            <div className="history-table">
              {history.map((item) => (
                <div className="history-row" key={item.id}>
                  <span>{item.travel_date}</span>
                  <strong>{item.boarded_crs} → {item.alighted_crs}</strong>
                  <em>{timeOnly(item.actual_departure || item.planned_departure)} / {timeOnly(item.actual_arrival || item.planned_arrival)}</em>
                  <b className={delayClass(item.arrival_lateness_minutes)}>{delayText(item.arrival_lateness_minutes)}</b>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function Metric({ label, planned, actual, delay, platform, t }: { label: string; planned: string; actual: string; delay?: number | null; platform?: string; t: typeof copy[Lang] }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{actual}</strong>
      <dl>
        <div><dt>{t.planned}</dt><dd>{planned}</dd></div>
        <div><dt>{t.delay}</dt><dd className={delayClass(delay)}>{delayText(delay)}</dd></div>
        <div><dt>{t.platform}</dt><dd>{platform || "—"}</dd></div>
      </dl>
    </div>
  );
}
