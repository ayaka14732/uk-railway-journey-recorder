# UK Railway Journey Recorder

A tool for logging UK train journeys, with service details fetched automatically from Realtime Trains.

## Motivation

Previously I logged my UK rail journeys by hand into a Google Sheet, which meant filling in a large number of fields every time — tedious and error-prone.

This project is inspired by the way [myFlightradar24](https://my.flightradar24.com/) tracks flight history: enter just the departure station, arrival station, and approximate boarding time, and the app can look up matching services on [Realtime Trains (RTT)](https://www.realtimetrains.co.uk/). Once you select the correct service, all remaining details — operator, scheduled times, actual times, delay reason, and more — are fetched and filled in automatically.

## Design

### Data source

[Realtime Trains](https://www.realtimetrains.co.uk/) provides real-time and historical train information for the UK rail network. A paid subscription (£4) unlocks up to 5 years of service history.

RTT does offer an API, but even for paid subscribers it only covers the last 14 days — not the full 5-year history. This app therefore uses **web scraping**: the backend fetches RTT pages directly and parses the HTML with BeautifulSoup4.

Because RTT requires a logged-in session to view data older than 14 days, **you must paste your RTT cookie into the Cookie field inside the Options dialog** when querying services from more than 14 days ago. The backend attaches that cookie to its requests.

### Database

SQLite is used as the database. The app is designed for personal local use with a modest data volume, so SQLite is more than sufficient — no separate database service needed.

### Stack

| Layer    | Technology                    | Port |
|----------|-------------------------------|------|
| Frontend | TypeScript + React + Vite     | 3000 |
| Backend  | Python + FastAPI              | 8000 |
| Database | SQLite (created automatically)| —    |
| Scraping | requests + BeautifulSoup4     | —    |

The Vite dev server proxies all `/api/*` requests to the backend (`:8000`), so your cookie is never exposed to the browser.

## Running the app

### First-time setup

```bash
# Install frontend dependencies
pnpm install

# Create a Python virtual environment and install backend dependencies
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
```

Create `backend/.env` with a strong random secret:

```bash
echo "JWT_SECRET=$(python3 -c 'import secrets; print(secrets.token_hex(32))')" > backend/.env
```

Then create your first user:

```bash
backend/.venv/bin/python -m backend.create_user
```

The script will prompt for a username and password.

### Starting the dev environment

You need two terminals running simultaneously:

```bash
# Terminal 1: start the FastAPI backend
pnpm api

# Terminal 2: start the Vite frontend
pnpm dev
```

Open http://localhost:3000 in your browser. Sign in with the credentials you created above — your journey page will be at `http://localhost:3000/u/<username>/`. Paste your RTT cookie into the **Cookie** field (inside the Options dialog) when querying services older than 14 days.

### Environment variables

| Variable                   | Required | Description                                                                     |
|----------------------------|----------|---------------------------------------------------------------------------------|
| `JWT_SECRET`               | Yes      | Secret key used to sign JWTs; the server refuses to start if this is not set    |
| `RAIL_HISTORY_SQLITE_PATH` | No       | Path to the SQLite file; defaults to `rail_history.sqlite3` in the project root |

## Miscellaneous

```bash
pnpm check    # TypeScript type checking
pnpm format   # Prettier formatting
pnpm build    # Production build
```

Built with Vibe Coding, initially written by [Manus AI](https://manus.im/), and improved with [Claude Code](https://claude.ai/code).
