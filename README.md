# UK Railway Journey Recorder

Log UK train journeys effortlessly by entering just the departure station, arrival station, and boarding time, with all service details filled in automatically.

## Motivation

Previously I logged my UK rail journeys by hand into a Google Sheet, which meant filling in a large number of fields every time, a tedious and error-prone process.

This project is inspired by the way [myFlightradar24](https://my.flightradar24.com/) tracks flight history: enter just the departure station, arrival station, and approximate boarding time, and the app can look up matching services on [Realtime Trains (RTT)](https://www.realtimetrains.co.uk/). Once you select the correct service, all remaining details (operator, scheduled times, actual times, delay reason, and more) are fetched and filled in automatically.

## Design

### Data source

[Realtime Trains](https://www.realtimetrains.co.uk/) provides real-time and historical train information for the UK rail network. A paid subscription (£4) unlocks up to 5 years of service history.

RTT does offer an API, but even for paid subscribers it only covers the last 14 days — not the full 5-year history. This app therefore uses **web scraping**: the backend fetches RTT pages directly and parses the HTML with BeautifulSoup4.

Since RTT requires a logged-in session to view data older than 14 days, **you must paste your RTT cookie into the Cookie field inside the Options dialog** when querying services from more than 14 days ago. The backend attaches that cookie to its requests.

### Stack

| Layer    | Technology                    | Port |
|----------|-------------------------------|------|
| Frontend | TypeScript + React + Vite     | 3000 |
| Backend  | Python + FastAPI              | 8000 |
| Database | SQLite (created automatically)| —    |
| Scraping | requests + BeautifulSoup4     | —    |

SQLite is used as the database. The app is designed for personal local use with a modest data volume, so SQLite is sufficient.

During local development, the frontend calls the FastAPI backend at `http://127.0.0.1:8000` by default. Set `VITE_API_BASE_URL` if your backend is running somewhere else.

For production, the frontend can be deployed as a static site, for example on GitHub Pages. Set `VITE_API_BASE_URL` at build time so browser API calls go to your own HTTPS backend endpoint.

## Development

### First-time setup

```bash
# Install frontend dependencies
pnpm install

# Create a Python virtual environment and install backend dependencies
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
```

Write to `backend/.env` with a strong random secret:

```bash
echo "JWT_SECRET=$(python3 -c 'import secrets; print(secrets.token_hex(32))')" >> backend/.env
```

Then create your first user:

```bash
backend/.venv/bin/python -m backend.create_user
```

The script will prompt for a display name, a username and a password.

### Running the app

You need two terminals running simultaneously:

```bash
# Terminal 1: start the FastAPI backend
pnpm api

# Terminal 2: start the Vite frontend
pnpm dev
```

Open http://localhost:3000 in your browser. Sign in with the credentials you created above. Your journey page will be at `http://localhost:3000/u/<username>/`.

## Deployment

### Frontend Deployment

The frontend is designed to be deployed on GitHub Pages.

On GitHub Pages, create repository Variables under **Settings → Secrets and variables → Actions → Variables**:

Set an variable `VITE_API_BASE_URL` to your backend API origin, for example `https://api.example.com`.

The included GitHub Actions workflow builds the frontend and deploys it to Pages.

### Backend Deployment

The backend is designed to be run as a Docker container.

Create `backend/.env` on the server:

```bash
JWT_SECRET=<strong-random-secret>
CORS_ALLOW_ORIGINS=https://ayaka14732.github.io
```

Then start the API:

```bash
cd backend
docker compose up -d --build
```

The Compose file binds the API to `127.0.0.1:8140` only, and stores SQLite data in a named Docker volume (`db_data`).

If you have an existing SQLite file to migrate into the volume:

```bash
docker compose build
docker compose run --rm \
  -v /path/to/rail_history.sqlite3:/tmp/src.sqlite3:ro \
  api cp /tmp/src.sqlite3 /app/backend/var/rail_history.sqlite3
docker compose up -d
```

If you want to create a new user:

```bash
docker compose exec api python -m backend.create_user
```

## Environment Variables

### Backend

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

### Frontend

| Variable            | Required | Description                                                                 |
|---------------------|----------|-----------------------------------------------------------------------------|
| `VITE_API_BASE_URL` | No       | Backend API origin, for example `https://api.example.com`; dev defaults to `http://127.0.0.1:8000`, production empty uses `/api` |
| `VITE_BASE_PATH`    | No       | Static site base path; for repo Pages use `/<repo-name>/`, for custom domains use `/` |

## Miscellaneous

```bash
pnpm check    # TypeScript type checking
pnpm format   # Prettier formatting
pnpm build    # Production build
```

Built with Vibe Coding, initially written by [Manus AI](https://manus.im/), and improved with [Claude Code](https://claude.ai/code) and [Codex](https://chatgpt.com/codex).
