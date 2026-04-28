# Realtime Trains API Findings

Visited on 2026-04-28.

## Portal status

The old Realtime Trains API home at `https://api.rtt.io/` now points users toward the newer API portal. It notes that the older portal will be disabled and APIs turned off on 31 September 2026.

## New portal

The new API portal is `https://api-portal.rtt.io/`. The portal states that it provides programmatic access to live and historical UK rail data, including train movements, schedules, and service information. It confirms that personal, non-commercial access is available after signing in and requesting an API token.

## Documentation link

The portal links to `https://realtimetrains.github.io/api-specification` for full API documentation, available endpoints, and response formats. The next implementation step is to inspect that documentation and implement the relevant endpoints behind our own backend so the user's token is never exposed to the browser.
