import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, ExternalLink, Plus } from "lucide-react";
import { apiJson } from "@/lib/api";
import { OperatorBadge } from "@/lib/operators";
import { localDateString } from "@/lib/utils";

export type Station = { crs: string; name: string; lat?: number; long?: number };

export type SearchForm = {
  travelDate: string;
  originCrs: string;
  destinationCrs: string;
  time: string;
  windowMinutes: number;
};

export type Candidate = {
  identity: string;
  uniqueIdentity?: string;
  departureDate: string;
  url?: string;
  trainReportingIdentity?: string;
  operatorName?: string;
  serviceOriginCrs?: string;
  serviceDestinationCrs?: string;
  plannedDeparture?: string;
  departureLatenessMinutes?: number | null;
  platformDeparture?: string | null;
  plannedArrival?: string;
  arrivalLatenessMinutes?: number | null;
  platformArrival?: string | null;
  isCancelled?: boolean;
};

const DEFAULT_FORM: SearchForm = {
  travelDate: localDateString(),
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

function timeWithDelay(time?: string, delay?: number | null) {
  const displayTime = timeOnly(time);
  if (delay === null || delay === undefined) return displayTime;
  return <>{displayTime} (<b className={delayClass(delay)}>{delayText(delay)}</b>)</>;
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
  const [activeIndex, setActiveIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeItemRef = useRef<HTMLDivElement>(null);

  const matched = useMemo(() => stations.find((s) => s.crs === value), [stations, value]);
  const displayLabel = matched ? `${matched.name} (${matched.crs})` : value;

  const filtered = useMemo(() => {
    if (!editing) return [];
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const results = stations.filter((s) => s.name.toLowerCase().includes(q) || s.crs.toLowerCase().startsWith(q));
    results.sort((a, b) => {
      const aExact = a.crs.toLowerCase() === q ? 0 : 1;
      const bExact = b.crs.toLowerCase() === q ? 0 : 1;
      return aExact - bExact;
    });
    return results.slice(0, 15);
  }, [stations, query, editing]);

  useEffect(() => { setActiveIndex(0); }, [filtered]);
  useEffect(() => { activeItemRef.current?.scrollIntoView({ block: "nearest" }); }, [activeIndex]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

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

  function commit(crs: string) {
    onChange(crs);
    setEditing(false);
    setQuery("");
  }

  return (
    <div className="station-input" ref={ref}>
      <input
        ref={inputRef}
        value={editing ? query : displayLabel}
        onFocus={() => { setEditing(true); setQuery(displayLabel); }}
        onClick={() => { if (!editing) { setEditing(true); setQuery(displayLabel); } }}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => { setEditing(false); setQuery(""); }, 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, filtered.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && filtered.length > 0) { e.preventDefault(); commit(filtered[activeIndex].crs); }
        }}
        placeholder={editing ? "Type station name or CRS…" : undefined}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="none"
      />
      {editing && filtered.length > 0 && (
        <div className="station-dropdown">
          {filtered.map((s, i) => (
            <div
              key={s.crs}
              ref={i === activeIndex ? activeItemRef : null}
              className={`station-option${i === activeIndex ? " active" : ""}`}
              onMouseDown={() => commit(s.crs)}
            >
              {s.name} ({s.crs})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function JourneySearch({
  stations,
  rttCookie,
  authHeaders,
  savedKeys,
  savingId = "",
  onAddCandidate,
}: {
  stations: Station[];
  rttCookie: string;
  authHeaders?: () => Record<string, string>;
  savedKeys?: Set<string>;
  savingId?: string;
  onAddCandidate?: (candidate: Candidate, form: SearchForm) => void;
}) {
  const [form, setForm] = useState<SearchForm>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const stationMap = useMemo(() => new Map(stations.map((s) => [s.crs, s.name])), [stations]);
  const candidateCols = 8;

  function stationLabel(crs?: string): string {
    if (!crs) return "—";
    const name = stationMap.get(crs);
    return name ? `${name} (${crs})` : crs;
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setHasSearched(false);
    setMessage("");
    setCandidates([]);
    try {
      const data = await apiJson<{ candidates: Candidate[] }>("/api/search-services", {
        method: "POST",
        headers: { "X-RTT-Cookie": rttCookie, ...(authHeaders?.() ?? {}) },
        body: JSON.stringify(form),
      });
      setCandidates(data.candidates);
      setHasSearched(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className="search-panel">
        <form className="search-form" onSubmit={search}>
          <label>Date<input type="date" value={form.travelDate} onChange={(e) => setForm({ ...form, travelDate: e.target.value })} /></label>
          <label>From<StationInput stations={stations} value={form.originCrs} onChange={(crs) => setForm({ ...form, originCrs: crs })} /></label>
          <button type="button" className="swap-btn" title="Swap From / To" onClick={() => setForm((f) => ({ ...f, originCrs: f.destinationCrs, destinationCrs: f.originCrs }))}>⇄</button>
          <label>To<StationInput stations={stations} value={form.destinationCrs} onChange={(crs) => setForm({ ...form, destinationCrs: crs })} /></label>
          <label>Near<input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></label>
          <label>Window<span className="input-with-unit"><input type="number" min={8} max={180} value={form.windowMinutes} onChange={(e) => setForm({ ...form, windowMinutes: Number(e.target.value) })} onBlur={(e) => { const v = Number(e.target.value); setForm((f) => ({ ...f, windowMinutes: Math.max(8, Math.min(180, v)) })); }} /><span>min</span></span></label>
          <button type="submit" disabled={loading}>{loading ? "Searching" : "Search"}</button>
        </form>
      </section>
      {message && <div className="message-line journey-search-message" role="status">{message}</div>}

      {hasSearched && (
        <section className="table-section">
          <div className="section-title">
            <h2>Candidate Services <span className="section-count">({candidates.length})</span></h2>
          </div>
          <div className="plain-table candidate-table">
            <table>
              <thead>
                <tr className="table-head">
                  <th>Operator</th><th>Service from</th><th>Service to</th><th>Dep</th><th>Plat</th><th>Arr</th><th>Plat</th><th></th>
                </tr>
              </thead>
              <tbody>
                {candidates.length === 0 ? (
                  <tr><td colSpan={candidateCols} className="empty-row">No matching services found.</td></tr>
                ) : candidates.map((candidate) => {
                  const key = `${candidate.identity}-${candidate.departureDate}`;
                  const saved = savedKeys?.has(key) ?? false;
                  return (
                    <tr className="data-row" key={key}>
                      <td>{candidate.operatorName ? <OperatorBadge name={candidate.operatorName} /> : "—"}</td>
                      <td>{stationLabel(candidate.serviceOriginCrs)}</td>
                      <td>{stationLabel(candidate.serviceDestinationCrs)}</td>
                      <td>{timeWithDelay(candidate.plannedDeparture, candidate.departureLatenessMinutes)}</td>
                      <td>{candidate.platformDeparture ?? "—"}</td>
                      <td>{timeWithDelay(candidate.plannedArrival, candidate.arrivalLatenessMinutes)}</td>
                      <td>{candidate.platformArrival ?? "—"}</td>
                      <td>
                        <div className="row-actions">
                          {candidate.url && (
                            <button type="button" className="icon-btn" title="Open link" onClick={() => window.open(candidate.url, "_blank", "noopener,noreferrer")}>
                              <ExternalLink size={13} strokeWidth={1.5} />
                            </button>
                          )}
                          {onAddCandidate && (
                            <button type="button" className="icon-btn" title={saved ? "Already added" : savingId === candidate.identity ? "Adding" : "Add"} onClick={() => onAddCandidate(candidate, form)} disabled={savingId === candidate.identity || saved}>
                              {saved ? (
                                <Check size={13} strokeWidth={1.5} />
                              ) : (
                                <Plus size={13} strokeWidth={1.5} />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
