import { publicAsset } from "@/lib/assets";

export default function NotFound() {
  return (
    <main className="plain-shell">
      <header className="plain-header">
        <div className="brand-mark">
          <img src={publicAsset("national-rail.svg")} alt="National Rail" />
          UK Railway Journey Recorder
        </div>
      </header>
      <section className="search-panel" style={{ maxWidth: 480, margin: "64px auto" }}>
        <div className="section-title"><h2>404 — Page not found</h2></div>
        <p style={{ padding: "10px 8px", fontSize: 13, color: "#555" }}>
          The page you requested does not exist.{" "}
          <a href={import.meta.env.BASE_URL} style={{ color: "var(--sbb-red)", fontWeight: 700 }}>Go home</a>
        </p>
      </section>
    </main>
  );
}
