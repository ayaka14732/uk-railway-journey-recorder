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

During local development, the frontend calls the FastAPI backend at `http://127.0.0.1:8000` by default. Set `VITE_API_BASE_URL` if your backend is running somewhere else.

For production, the frontend can be deployed as a static site, for example on GitHub Pages. Set `VITE_API_BASE_URL` at build time so browser API calls go to your own HTTPS backend endpoint.

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

#### Backend

| Variable                   | Required | Description                                                                     |
|----------------------------|----------|---------------------------------------------------------------------------------|
| `JWT_SECRET`               | Yes      | Secret key used to sign JWTs; the server refuses to start if this is not set    |
| `RAIL_HISTORY_SQLITE_PATH` | No       | Path to the SQLite file; defaults to `backend/var/rail_history.sqlite3` |
| `CORS_ALLOW_ORIGINS`       | No       | Comma-separated frontend origins allowed to call the API; defaults to local dev |

Example for a GitHub Pages frontend:

```bash
CORS_ALLOW_ORIGINS=https://ayaka14732.github.io
```

Use the exact origin only: scheme, host, and optional port, without a path.

#### Frontend build

| Variable            | Required | Description                                                                 |
|---------------------|----------|-----------------------------------------------------------------------------|
| `VITE_API_BASE_URL` | No       | Backend API origin, for example `https://api.example.com`; dev defaults to `http://127.0.0.1:8000`, production empty uses `/api` |
| `VITE_BASE_PATH`    | No       | Static site base path; for repo Pages use `/<repo-name>/`, for custom domains use `/` |

For GitHub Pages, create repository Variables under **Settings → Secrets and variables → Actions → Variables**:

```text
VITE_API_BASE_URL=https://api.example.com
VITE_BASE_PATH=/uk-railway-journey-recorder/
```

The included GitHub Actions workflow builds the frontend and deploys `dist/public` to Pages. It also copies `index.html` to `404.html` so direct links such as `/uk-railway-journey-recorder/u/<username>/` still load the React app.

## Miscellaneous

```bash
pnpm check    # TypeScript type checking
pnpm format   # Prettier formatting
pnpm build    # Production build
```

## Docker deployment

The backend can be run as a Docker container while Caddy stays on the host and
terminates HTTPS.

Create `backend/.env` on the server:

```bash
JWT_SECRET=<strong-random-secret>
CORS_ALLOW_ORIGINS=https://ayaka14732.github.io
```

Then start the API:

```bash
cd backend
chown -R 1000:1000 var
docker compose up -d --build
```

To build the backend image directly:

```bash
cd backend
docker build -t uk-railway-journey-recorder-api .
```

The Compose file binds the API to `127.0.0.1:8140` only, and stores SQLite data
in `./var/rail_history.sqlite3` by default. Point Caddy at the local
container port:

```caddyfile
uk-railway-journey-recorder-api.shn.hk {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8140
}
```

Useful operational commands:

```bash
docker compose logs -f api
docker compose ps
docker compose pull
docker compose up -d --build
docker compose exec api python -m backend.create_user
```

Built with Vibe Coding, initially written by [Manus AI](https://manus.im/), and improved with [Claude Code](https://claude.ai/code).
