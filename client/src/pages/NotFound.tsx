/*
 * Design reminder: Plain SBB-inspired utility interface.
 * Keep this fallback page English-only, simple, red/black/white, and without animation or decorative effects.
 */
import { Link } from "wouter";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <section className="not-found-box">
        <h1>Page not found</h1>
        <p>The page you requested does not exist.</p>
        <Link href="/">Back to My UK Railway Journeys</Link>
      </section>
    </main>
  );
}
