# WorkoutTracker

Single-file HTML app — no build system, no package.json, no tests.

## Stack
- `gym-plan.html` — entire app in one ~3900-line file (HTML + CSS + JS)
- Data: localStorage (key `pgymplan_v5`) + Google Sheets via Apps Script URL (`SHEETS_URL`)
- Charts: Chart.js 4.4.1 (CDN)
- Fonts: Bebas Neue + DM Sans (Google Fonts)

## Data flow
- Weights/checks saved locally immediately, then async POST to Sheets
- History fetched live from Sheets on demand (lazy-loaded)

## Backend
- `apps-script/Code.gs` — mirror of the Google Apps Script `doGet()` handler deployed at `SHEETS_URL` (script.google.com). This is the source of truth for review/history; the deployment itself is edited by pasting this file's contents into the Apps Script online editor, then Deploy → Manage deployments → Edit → New version (the `/exec` URL is pinned to a deployment version, so code changes don't take effect until a new version is deployed). No clasp/CLI sync — keep this file updated by hand when the deployed script changes.

## Reading the file
- File is ~3900 lines — use offset/limit when reading; CSS ends ~line 122, JS starts ~line 133
