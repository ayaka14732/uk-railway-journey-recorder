import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import JourneySearch, { type Station } from "@/components/JourneySearch";
import { apiJson } from "@/lib/api";
import { auth } from "@/lib/auth";
import { publicAsset } from "@/lib/assets";

export default function SearchPage() {
  const [, setLocation] = useLocation();
  const token = auth.token();
  const [stations, setStations] = useState<Station[]>([]);
  const [rttCookie, setRttCookie] = useState<string>(() => localStorage.getItem("rtt_cookie") ?? "");
  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [draftCookie, setDraftCookie] = useState<string>(() => localStorage.getItem("rtt_cookie") ?? "");

  function authHeaders(): Record<string, string> {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function logout() {
    auth.clear();
    setLocation("/");
  }

  function saveCookie() {
    const c = draftCookie.trim();
    if (!c) return;
    setRttCookie(c);
    localStorage.setItem("rtt_cookie", c);
    setShowTokenDialog(false);
  }

  useEffect(() => {
    async function loadStations() {
      try {
        const data = await apiJson<{ stations: Station[] }>("/api/stations-local");
        setStations(data.stations);
      } catch {
        // Station names are cosmetic.
      }
    }
    loadStations();
  }, []);

  return (
    <main className="plain-shell">
      <header className="plain-header">
        <div className="brand-mark">
          <img src={publicAsset("national-rail.svg")} alt="National Rail" />
          Search Rail Services
        </div>
        <div className="header-actions">
          <button type="button" className="stats-header-btn" onClick={() => { setDraftCookie(rttCookie); setShowTokenDialog(true); }}>
            {rttCookie ? "Cookie ✓" : "Set cookie"}
          </button>
          {token ? (
            <button type="button" className="token-header-btn" onClick={logout}>Sign out</button>
          ) : (
            <button type="button" className="token-header-btn" onClick={() => setLocation("/login/")}>Sign in</button>
          )}
        </div>
      </header>

      {showTokenDialog && (
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

      <JourneySearch
        stations={stations}
        rttCookie={rttCookie}
        authHeaders={authHeaders}
      />
    </main>
  );
}
