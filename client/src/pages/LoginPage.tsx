import { FormEvent, useState } from "react";
import { useLocation } from "wouter";
import { apiJson } from "@/lib/api";
import { auth } from "@/lib/auth";
import { publicAsset } from "@/lib/assets";
import { isValidUsername } from "@/lib/username";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValidUsername(username)) {
      setError("Username must be lowercase letters and digits only.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await apiJson<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      auth.set(data.token, username);
      setLocation(`/u/${username}/`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="plain-shell">
      <header className="plain-header">
        <div className="brand-mark">
          <img src={publicAsset("national-rail.svg")} alt="National Rail" />
          UK Railway Journey Recorder
        </div>
      </header>
      <section className="search-panel" style={{ maxWidth: 340, margin: "64px auto" }}>
        <div className="section-title"><h2>Sign In</h2></div>
        <form style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 16px 16px" }} onSubmit={handleSubmit}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 700, color: "#444" }}>
            Username
            <input className="add-dialog-input" type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" style={{ fontWeight: 400 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 700, color: "#444" }}>
            Password
            <input className="add-dialog-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" style={{ fontWeight: 400 }} />
          </label>
          {error && <div className="message-line">{error}</div>}
          <button type="submit" disabled={loading || !username || !password} style={{ marginTop: 4, border: "1px solid var(--sbb-red)", background: "var(--sbb-red)", color: "#fff", font: "inherit", fontWeight: 700, padding: "6px 12px", cursor: "pointer" }}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
