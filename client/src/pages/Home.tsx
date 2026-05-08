import { useLocation } from "wouter";
import { auth } from "@/lib/auth";
import { publicAsset } from "@/lib/assets";

function logout() {
  auth.clear();
  window.location.reload();
}

export default function Home() {
  const [, setLocation] = useLocation();
  const token = auth.token();
  return (
    <main className="plain-shell">
      <header className="plain-header">
        <div className="brand-mark">
          <img src={publicAsset("national-rail.svg")} alt="National Rail" />
          UK Railway Journey Recorder
        </div>
        {token ? (
          <button type="button" className="token-header-btn" style={{ marginLeft: "auto" }} onClick={logout}>Sign out</button>
        ) : (
          <button type="button" className="token-header-btn" style={{ marginLeft: "auto" }} onClick={() => setLocation("/login")}>Sign in</button>
        )}
      </header>
      <section style={{ maxWidth: 600, margin: "64px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--sbb-red)", marginBottom: 12 }}>
          UK Railway Journey Recorder
        </h1>
        <p style={{ color: "var(--sbb-ink)", lineHeight: 1.5 }}>
          Record and revisit your train journeys across Great Britain. Log where you travelled,
          when you arrived, and why. Then explore your history through stats, maps, and a
          searchable journey table.
        </p>
        <p style={{ marginTop: 12, color: "var(--sbb-ink)", lineHeight: 1.5 }}>
          <a href="https://github.com/ayaka14732/uk-railway-journey-recorder" target="_blank" rel="noreferrer" style={{ color: "var(--sbb-red)" }}>
            View on GitHub
          </a>
        </p>
      </section>
    </main>
  );
}
