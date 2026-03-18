# WorkoutTracker

Single-file HTML app — no build system, no package.json, no tests.

## Stack
- `gym-plan.html` — entire app in one ~1300-line file (HTML + CSS + JS)
- Data: localStorage (key `pgymplan_v5`) + Google Sheets via Apps Script URL (`SHEETS_URL`)
- Charts: Chart.js 4.4.1 (CDN)
- Fonts: Bebas Neue + DM Sans (Google Fonts)

## Data flow
- Weights/checks saved locally immediately, then async POST to Sheets
- History fetched live from Sheets on demand (lazy-loaded)

## Reading the file
- File is ~1300 lines — use offset/limit when reading; CSS ends ~line 122, JS starts ~line 133
