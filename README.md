# Apple Refurb Watcher

A lightweight Next.js dashboard that monitors Apple's Certified Refurbished Mac store across multiple countries. Track new arrivals, removed products, and price changes without relying on any external APIs or API keys.

## Features

- **Multi-country support** — Monitor refurbished stores in Poland (default), United States, United Kingdom, Germany, France, Spain, Italy, Canada, and Australia.
- **Change detection** — Automatically detects and highlights:
  - **New** products (green badge)
  - **Removed** products (red section)
  - **Price changes** (amber badge with previous price)
- **24-hour change history** — Changes stay highlighted for 24 hours, so frequent auto-refreshes don't hide new arrivals.
- **Price history** — Every price change is stored in a local SQLite file. Cards show the lowest price seen, a small price chart, and when the product was listed.
- **Sort and search** — Sort by price, biggest discount, or newest first; search titles and specs (e.g. `M5 Pro 48 GB`).
- **Smart filtering** — Filter by Model, Screen size, Chip, CPU/GPU cores, Memory, Storage, and Color using clickable tags.
- **Current lineup** — Recognizes MacBook Neo (A18 Pro), M5-family Macs, Studio Display, and Studio Display XDR. Unknown future models and colors fall back to Apple's own labels.
- **Background auto-refresh** — Per-country schedule that starts with the server, no open browser tab needed.
- **No API keys** — Scrapes data directly from Apple's public storefront. No registration or API keys required.
- **Docker support** — Run locally with a single `docker run` command.
- **GitHub Container Registry** — Pre-built images published automatically on release tags.
- **Bunny.net Magic Containers** — Automatic rolling deployments to Bunny.net's serverless container platform on every release.

## Quick Start

### Docker (recommended)

```bash
docker run -d \
  -p 3000:3000 \
  -v refurb-data:/app/data \
  --name refurb-watcher \
  ghcr.io/YOUR_USERNAME/apple-refurb-watcher:latest
```

Then open [http://localhost:3000](http://localhost:3000).

> Replace `YOUR_USERNAME` with your GitHub username or build the image locally (see below).

### Local Development

```bash
# Install dependencies
npm install

# Run the dev server
npm run dev

# Open http://localhost:3000
```

To fetch data, click the **Refresh** button in the UI.

## Building the Docker Image

```bash
docker build -t apple-refurb-watcher .
docker run -d -p 3000:3000 -v refurb-data:/app/data apple-refurb-watcher
```

## Deploy to Bunny.net Magic Containers

This repository includes a GitHub Action that automatically deploys to [Bunny.net Magic Containers](https://bunny.net/magic-containers/) after a successful release build.

### Prerequisites

1. Create an application on [Bunny.net Magic Containers](https://bunny.net/magic-containers/).
2. Configure the container image to pull from `ghcr.io/YOUR_USERNAME/apple-refurb-watcher`.
3. Add the following to your GitHub repository (**Settings → Secrets and variables → Actions**):

| Type | Name | Value |
|------|------|-------|
| Variable | `BUNNYNET_APP_ID` | Your Bunny.net Magic Containers App ID |
| Secret | `BUNNYNET_API_KEY` | Your Bunny account API key |

### Container settings

- **Persistent volume** mounted at `/app/data`. It holds all state and the price history; without it everything resets on each deploy.
- **Autoscaling: min 1, max 1.** Each instance gets its own volume, so more than one instance would split the data.
- **Health check:** HTTP GET `/api/health` on port `3000`. It returns the running version, e.g. `{"status":"ok","version":"1.1.0",...}`.

### How it works

When you publish a release (or push a `v*` tag), the workflow:
1. Builds and publishes the Docker image to GHCR
2. Triggers a rolling update on Bunny.net Magic Containers (skipped until the variable and secret above are set)

No manual deployment steps are required after the initial setup.

### Testing a pull request

Every pull request against `main` publishes a preview image, `ghcr.io/YOUR_USERNAME/apple-refurb-watcher:pr-<number>`. It is not deployed automatically. To try it, set that tag on the container in Magic Containers. To go back, set the release tag again.

## How It Works

1. The app fetches Apple's refurbished Mac category page for the selected country.
2. It extracts structured product data from the page's embedded JSON (with a Cheerio-based HTML fallback).
3. Products are compared against the locally stored state to detect changes.
4. Changes and the current catalog are saved to `data/state-<country>.json`. Changes from the last 24 hours are kept as a rolling history, and price changes go into `data/history.db` (SQLite).
5. The dashboard displays the current catalog with change highlights and interactive filters. The selected country is kept in the URL (`/?country=us`).

## Tech Stack

- [Next.js 16.2](https://nextjs.org/) (App Router, Turbopack)
- [React 19.2](https://react.dev/)
- [TypeScript 6.0](https://www.typescriptlang.org/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Cheerio](https://cheerio.js.org/) (HTML fallback parsing)

## Supported Countries

| Country | Code | Currency |
|---------|------|----------|
| Poland | `pl` | PLN |
| United States | `us` | USD |
| United Kingdom | `uk` | GBP |
| Germany | `de` | EUR |
| France | `fr` | EUR |
| Spain | `es` | EUR |
| Italy | `it` | EUR |
| Canada | `ca` | CAD |
| Australia | `au` | AUD |

## Publishing a Release

Push a semver tag to trigger the GitHub Action that builds and publishes the Docker image to GHCR:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Or create a release via the GitHub UI.

## Data Storage

The app stores state in JSON files and price history in a SQLite file (`history.db`) inside the `data/` directory (or `/app/data` in Docker). No external database is required; mount a volume at `/app/data` to keep the data across deploys.

## Disclaimer

This project is an unofficial tool and is not affiliated with, endorsed by, or sponsored by Apple Inc. It simply scrapes publicly available information from Apple's certified refurbished store pages. Use at your own risk and please respect Apple's [Terms of Service](https://www.apple.com/legal/internet-services/terms/site.html).

## License

MIT
