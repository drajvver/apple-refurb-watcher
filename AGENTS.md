# Apple Refurb Watcher — Agent Guide

## Project Overview

Apple Refurb Watcher is a lightweight Next.js dashboard that monitors Apple's Certified Refurbished Mac store across multiple countries. It scrapes public Apple storefront pages directly — no API keys or external services are required. The app detects new arrivals, removed products, and price changes, then persists state locally in JSON files.

- **Name:** `apple-refurb-watcher`
- **Version:** `2.0.0`
- **License:** MIT

## Technology Stack

- **Framework:** Next.js 16.2 (App Router, Turbopack)
- **UI Library:** React 19.2
- **Language:** TypeScript 6.0 (strict mode enabled)
- **Styling:** Tailwind CSS v4
- **HTML Parsing:** Cheerio (fallback parsing only)
- **Price history:** SQLite via Node's built-in `node:sqlite` (no extra dependency)
- **Runtime:** Node.js 24 (in Docker, Next.js standalone output)

## Project Structure

```
├── src/
│   ├── instrumentation.ts          # Starts the scheduler once at server boot
│   ├── app/
│   │   ├── layout.tsx              # Root layout (Inter font, metadata)
│   │   ├── page.tsx                # Server Component — reads initial state for ?country from disk
│   │   ├── globals.css             # Tailwind CSS entrypoint
│   │   └── api/
│   │       ├── refresh/
│   │       │   └── route.ts        # POST endpoint to scrape & detect changes
│   │       ├── state/
│   │       │   └── route.ts        # GET saved state for a country (no scraping)
│   │       ├── health/
│   │       │   └── route.ts        # GET liveness/startup probe (version, DB status)
│   │       └── settings/
│   │           └── route.ts        # GET/POST auto-refresh settings
│   ├── components/
│   │   ├── Dashboard.tsx           # Client Component — filters, stats, product grid
│   │   └── ThemeToggle.tsx         # Light/dark toggle
│   └── lib/
│       ├── config.ts               # Country configs, URLs, file paths, change window
│       ├── types.ts                # TypeScript interfaces
│       ├── scraper.ts              # Apple page fetcher + product parser
│       ├── watcher.ts              # State loader/saver + change detector + 24h history
│       ├── history.ts              # SQLite price history (record + query, migrations)
│       ├── storage.ts              # JSON read / atomic write helpers
│       ├── settings.ts             # Auto-refresh settings persistence
│       └── scheduler.ts            # Background auto-refresh timer
├── data/
│   ├── state.json                  # Legacy state file (Poland only, backward compat)
│   ├── state-<country>.json        # Per-country persisted state
│   ├── history.db                  # SQLite price history (all countries)
│   └── settings.json               # Auto-refresh configuration
├── Dockerfile                      # Multi-stage build (deps → builder → runner)
├── next.config.mjs                 # `output: "standalone"` for a small Docker image
├── postcss.config.mjs              # Tailwind CSS PostCSS plugin
├── tsconfig.json                   # Strict TypeScript, path alias `@/*` → `./src/*`
└── package.json
```

## Build & Development Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run dev` | Start Next.js development server (port 3000) |
| `npm run build` | Create production build |
| `npm run start` | Start production server |

There are **no test commands** — the project does not include a test framework.

## Runtime Architecture

1. **Server Component (`page.tsx`)**
   - Reads the `?country=` search param (falls back to `DEFAULT_COUNTRY`).
   - Loads the persisted state via `getDashboardState(country)` at request time.
   - Exports `dynamic = "force-dynamic"` to prevent static generation.
   - Falls back to `data/state.json` for Poland if `data/state-pl.json` is missing (legacy migration).

2. **Client Component (`Dashboard.tsx`)**
   - Displays products, statistics, and interactive tag filters.
   - Switching country loads saved state from `GET /api/state`; it only scrapes countries that were never fetched.
   - Keeps the selected country in the URL (`history.replaceState`).
   - Calling `refreshCountry(code)` POSTs to `/api/refresh?country=<code>`.
   - While auto-refresh is on, polls `GET /api/state` every minute to pick up scheduler refreshes.

3. **API Route (`api/refresh/route.ts`)**
   - Validates the country code against the hard-coded `COUNTRIES` list.
   - Calls `fetchProducts(country)` (scraper) then `fetchAndDetectChanges(...)` (watcher).
   - Returns the current catalog, `changes` (this refresh), `recentChanges` (last 24h), timestamp, and `isFirstRun` flag.

4. **API Route (`api/settings/route.ts`)**
   - `GET` returns the current auto-refresh settings.
   - `POST` updates per-country auto-refresh config (`enabled`, `intervalMinutes`).

5. **Scraper (`scraper.ts`)**
   - Fetches `https://www.apple.com/<country>/shop/refurbished/mac` (30s timeout).
   - Attempts to extract `window.REFURB_GRID_BOOTSTRAP` embedded JSON first.
   - Falls back to Cheerio-based HTML parsing if JSON is absent. Throws if neither finds products, so a blocked or redesigned page never wipes the saved state.
   - Normalizes prices, specs, and images into a uniform `Product[]` array.
   - Model and color names come from `MODEL_NAMES` / `COLOR_NAMES`; unknown keys fall back to Apple's labels in `bootstrap.dictionaries.dimensions`. The `display` model key is split by title (`Studio Display`, `Studio Display XDR`).
   - Chip (`M5 Pro`, `A18 Pro`) and CPU/GPU cores are parsed from the localized title.

6. **Watcher (`watcher.ts`)**
   - Loads previous state from `data/state-<country>.json`.
   - Compares old vs. new products by `partNumber` to detect:
     - `added` — new part numbers
     - `removed` — missing part numbers
     - `price_changed` — same part number, different `refurbPrice`
   - Merges them into `recentChanges`, a rolling `CHANGE_WINDOW_HOURS` (24h) history with one entry per product.
   - Writes the new state back to disk atomically (temp file + rename).
   - Records prices in the history database (`recordPrices`) and returns `priceHistory` for listed and recently removed products.
   - Concurrent refreshes for the same country share one run.

7. **Scheduler (`scheduler.ts`)**
   - Started once when the server boots, from `src/instrumentation.ts`.
   - Runs immediately, then on a `setInterval` loop every minute. Passes never overlap.
   - For each country with `autoRefresh.enabled`, checks if the interval has elapsed since the last fetch.
   - Triggers `fetchAndDetectChanges` automatically when due.

8. **Settings (`settings.ts`)**
   - Reads/writes `data/settings.json`.
   - Stores per-country `AutoRefreshConfig` objects.

9. **Price history (`history.ts`)**
   - SQLite file `data/history.db`, opened once per process with `node:sqlite`.
   - Table `price_points(country, part_number, price, observed_at)`. A row is written only when a product is first seen or its price changes, so the file stays small.
   - Schema changes go in the append-only `MIGRATIONS` array (tracked with `PRAGMA user_version`); never edit an existing entry.
   - Failures are logged and return empty history; they never fail a refresh.
   - `trackingSince` (first point for a country) tells the UI which products have an unknown listing date.

10. **Health (`api/health/route.ts`)**
    - Returns `{ status, version, uptimeSeconds, historyDb }`. Always 200 while the server runs; a broken database reports `"degraded"`.
    - `version` comes from the `APP_VERSION` build arg (set by CI from the git tag).

## Code Style Guidelines

- **Path alias:** Use `@/` for all cross-module imports (e.g., `@/lib/config`).
- **Client components:** Must start with `"use client";` if they use React hooks or browser APIs.
- **Server components:** Default in App Router; do not add `"use client"` to `page.tsx` or `layout.tsx`.
- **Types:** Prefer explicit interface names (e.g., `Product`, `WatcherChange`) from `@/lib/types`.
- **Error handling:** Use `try/catch` around filesystem reads/writes and network fetches. Return safe fallbacks (empty arrays, `null`) on failure.
- **Formatting:** The project relies on Next.js / TypeScript defaults.

## Multi-Country Support

Countries are defined in `src/lib/config.ts`. Each country has:

- `code` — ISO-style code used in URLs and filenames (`pl`, `us`, `uk`, `de`, `fr`, `es`, `it`, `ca`, `au`)
- `urlPath` — Apple subdomain/path segment
- `locale` / `currency` — used for price formatting
- `language` — used for title parsing heuristics
- `thousandSeparator` / `decimalSeparator` — used when scraping prices from HTML text

**Default country:** `pl` (Poland).

To add a new country:
1. Append an entry to `COUNTRIES` in `src/lib/config.ts`.
2. Ensure the Apple refurbished URL follows the pattern `https://www.apple.com/<urlPath>/shop/refurbished/mac`.
3. Verify price separators match the locale's formatting.

## Data Storage

State is stored as plain JSON in the `data/` directory (or `/app/data` inside Docker):

- `data/state-<country>.json` — current products, timestamp, last detected changes, and 24h `recentChanges`
- `data/state.json` — legacy file; migrated automatically to `state-pl.json` on first read
- `data/history.db` — SQLite price history (see Runtime Architecture → Price history)

No external database or service is used. Everything lives in `data/`, so one volume persists it all.

## Docker & Deployment

The repository includes a multi-stage `Dockerfile`:

1. `builder` — installs all dependencies and runs `npm run build` (standalone output)
2. `runner` — `node:24-alpine` with only `.next/standalone` + `.next/static`, runs `node server.js` as the `node` user, exposes port `3000`, `HEALTHCHECK` on `/api/health`

Build locally:
```bash
docker build -t apple-refurb-watcher .
docker run -d -p 3000:3000 -v refurb-data:/app/data apple-refurb-watcher
```

A GitHub Actions workflow (`.github/workflows/docker-publish.yml`) publishes the image to GHCR on semver tags (`v*`, which GitHub releases also create). It deploys to Bunny.net Magic Containers only when the `BUNNYNET_APP_ID` variable and `BUNNYNET_API_KEY` secret are set; otherwise the deploy job is skipped. Pull requests against `main` also publish preview images tagged `pr-<number>` and `sha-<short>`; these are never deployed automatically.

### Magic Containers requirements
- **Volume** mounted at `/app/data` (JSON state + `history.db`). Without it, all data is lost on every deploy.
- **Exactly one instance** (autoscaling min = max = 1). Each instance gets its own blank volume, so more instances would split the data.
- **Probes:** HTTP GET `/api/health` on port 3000 (startup + liveness).
- Volumes have no backups. Copy `history.db` out if the price history matters.

## Security Considerations

- **No authentication or authorization** — the dashboard is fully open.
- **No secrets or API keys** — everything is public-facing scraping.
- **Network requests** — the scraper sends a standard browser `User-Agent` to Apple's public storefront.
- **Filesystem access** — the server reads from and writes to `data/` inside the working directory. In Docker this directory should be a volume for persistence.
- **Input validation** — the `/api/refresh` endpoint validates country codes against the hard-coded `COUNTRIES` array.
- **Disclaimer:** This is an unofficial tool. It is not affiliated with Apple Inc.

## Common Tasks

### Refreshing data manually
Click the **Refresh** button in the UI, or send a POST request:
```bash
curl -X POST "http://localhost:3000/api/refresh?country=us"
```

### Resetting state
Delete the relevant `data/state-<country>.json` file (or `data/state.json` for legacy Poland). The next refresh will treat it as a first run.

### Configuring auto-refresh
Use the **Auto** checkbox and interval dropdown in the header for the selected country, or call the settings API directly:
```bash
curl -X POST "http://localhost:3000/api/settings" \
  -H "Content-Type: application/json" \
  -d '{"country":"us","config":{"enabled":true,"intervalMinutes":30}}'
```

### Adding a new spec filter
The dashboard filters by `model`, `screenSize`, `chip`, `cores`, `memory`, `storage`, and `color`. These keys are hard-coded in `Dashboard.tsx` (`SPEC_KEYS` and `SPEC_LABELS`). If you add a new spec key, update both arrays and the `ProductSpecs` interface in `src/lib/types.ts`. Make new keys optional in `ProductSpecs`, since saved state from older versions won't have them.

### Supporting a newly launched Apple product
New models and colors already show up using Apple's own labels. For a clean English name, add the `refurbClearModel` key to `MODEL_NAMES` and a title pattern to `MODEL_PATTERNS` (or the `dimensionColor` key to `COLOR_NAMES`) in `src/lib/scraper.ts`. To find the keys, look at `tiles[].filters.dimensions` in the page's `window.REFURB_GRID_BOOTSTRAP` JSON.
