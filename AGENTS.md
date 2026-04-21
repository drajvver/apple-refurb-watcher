# Apple Refurb Watcher — Agent Guide

## Project Overview

Apple Refurb Watcher is a lightweight Next.js dashboard that monitors Apple's Certified Refurbished Mac store across multiple countries. It scrapes public Apple storefront pages directly — no API keys or external services are required. The app detects new arrivals, removed products, and price changes, then persists state locally in JSON files.

- **Name:** `apple-refurb-watcher`
- **Version:** `2.0.0`
- **License:** MIT

## Technology Stack

- **Framework:** Next.js 15 (App Router)
- **UI Library:** React 19
- **Language:** TypeScript 5.8 (strict mode enabled)
- **Styling:** Tailwind CSS v4
- **HTML Parsing:** Cheerio (fallback parsing only)
- **Runtime:** Node.js 22 (in Docker)

## Project Structure

```
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout (Inter font, metadata)
│   │   ├── page.tsx                # Server Component — reads initial state from disk
│   │   ├── globals.css             # Tailwind CSS entrypoint
│   │   └── api/
│   │       └── refresh/
│   │           └── route.ts        # POST endpoint to scrape & detect changes
│   ├── components/
│   │   └── Dashboard.tsx           # Client Component — filters, stats, product grid
│   └── lib/
│       ├── config.ts               # Country configs, URLs, file paths
│       ├── types.ts                # TypeScript interfaces
│       ├── scraper.ts              # Apple page fetcher + product parser
│       └── watcher.ts              # State loader/saver + change detector
├── data/
│   ├── state.json                  # Legacy state file (Poland only, backward compat)
│   └── state-<country>.json        # Per-country persisted state
├── Dockerfile                      # Multi-stage build (deps → builder → runner)
├── next.config.mjs                 # Empty/default Next.js config
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
| `npm run lint` | Run ESLint via Next.js |

There are **no test commands** — the project does not include a test framework.

## Runtime Architecture

1. **Server Component (`page.tsx`)**
   - Reads the persisted state file from disk at request time.
   - Exports `dynamic = "force-dynamic"` to prevent static generation.
   - Passes the initial state to the `Dashboard` client component.
   - Falls back to `data/state.json` for Poland if `data/state-pl.json` is missing (legacy migration).

2. **Client Component (`Dashboard.tsx`)**
   - Displays products, statistics, and interactive tag filters.
   - Calling `refreshCountry(code)` POSTs to `/api/refresh?country=<code>`.
   - Updates local React state with the response.

3. **API Route (`api/refresh/route.ts`)**
   - Validates the country code against the hard-coded `COUNTRIES` list.
   - Calls `fetchProducts(country)` (scraper) then `fetchAndDetectChanges(...)` (watcher).
   - Returns the current catalog, detected changes, timestamp, and `isFirstRun` flag.

4. **Scraper (`scraper.ts`)**
   - Fetches `https://www.apple.com/<country>/shop/refurbished/mac`.
   - Attempts to extract `window.REFURB_GRID_BOOTSTRAP` embedded JSON first.
   - Falls back to Cheerio-based HTML parsing if JSON is absent.
   - Normalizes prices, specs, and images into a uniform `Product[]` array.

5. **Watcher (`watcher.ts`)**
   - Loads previous state from `data/state-<country>.json`.
   - Compares old vs. new products by `partNumber` to detect:
     - `added` — new part numbers
     - `removed` — missing part numbers
     - `price_changed` — same part number, different `refurbPrice`
   - Writes the new state back to disk.

## Code Style Guidelines

- **Path alias:** Use `@/` for all cross-module imports (e.g., `@/lib/config`).
- **Client components:** Must start with `"use client";` if they use React hooks or browser APIs.
- **Server components:** Default in App Router; do not add `"use client"` to `page.tsx` or `layout.tsx`.
- **Types:** Prefer explicit interface names (e.g., `Product`, `WatcherChange`) from `@/lib/types`.
- **Error handling:** Use `try/catch` around filesystem reads/writes and network fetches. Return safe fallbacks (empty arrays, `null`) on failure.
- **Formatting:** The project relies on Next.js / ESLint defaults. Run `npm run lint` before committing.

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

- `data/state-<country>.json` — current products, timestamp, and last detected changes
- `data/state.json` — legacy file; migrated automatically to `state-pl.json` on first read

No database or external persistence is used.

## Docker & Deployment

The repository includes a multi-stage `Dockerfile`:

1. `deps` — installs production dependencies
2. `builder` — installs all dependencies and runs `npm run build`
3. `runner` — copies only production artifacts, runs as `node` user, exposes port `3000`

Build locally:
```bash
docker build -t apple-refurb-watcher .
docker run -d -p 3000:3000 -v refurb-data:/app/data apple-refurb-watcher
```

A GitHub Actions workflow (`.github/workflows/docker-publish.yml`) publishes the image to GHCR on semver tags (`v*`) and GitHub releases.

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

### Adding a new spec filter
The dashboard filters by `model`, `screenSize`, `chip`, `memory`, `storage`, and `color`. These keys are hard-coded in `Dashboard.tsx` (`SPEC_KEYS` and `SPEC_LABELS`). If you add a new spec key, update both arrays and the `ProductSpecs` interface in `src/lib/types.ts`.
