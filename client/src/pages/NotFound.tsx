import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();
  return (
    <main className="plain-shell">
      <header className="plain-header">
        <div className="brand-mark">
          <img src="/national-rail.svg" alt="National Rail" />
          UK Railway Journey Recorder
        </div>
      </header>
      <section className="search-panel" style={{ maxWidth: 480, margin: "64px auto" }}>
        <div className="section-title"><h2>404 — Page not found</h2></div>
        <p style={{ padding: "10px 8px", fontSize: 13, color: "#555" }}>
          The page you requested does not exist.{" "}
          <span style={{ color: "var(--sbb-red)", cursor: "pointer", fontWeight: 700 }} onClick={() => setLocation("/")}>
            Go home
          </span>
        </p>
      </section>
    </main>
  );
}
