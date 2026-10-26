import { loadSettings } from "./settings";
import { loadState, fetchAndDetectChanges } from "./watcher";
import { fetchProducts } from "./scraper";
import { COUNTRIES } from "./config";

// Survives dev-server hot reloads, which re-evaluate this module.
const globalForScheduler = globalThis as typeof globalThis & {
  __refurbSchedulerStarted?: boolean;
};

async function refreshDueCountries(): Promise<void> {
  const settings = loadSettings();
  const now = Date.now();

  for (const country of COUNTRIES.map((c) => c.code)) {
    const config = settings.autoRefresh[country];
    if (!config?.enabled) continue;

    const state = loadState(country);
    const lastFetch = state?.lastFetchTimestamp
      ? new Date(state.lastFetchTimestamp).getTime()
      : 0;
    const intervalMs = config.intervalMinutes * 60 * 1000;

    if (now - lastFetch >= intervalMs) {
      try {
        await fetchAndDetectChanges(() => fetchProducts(country), country);
        console.log(`[scheduler] Auto-refreshed ${country}`);
      } catch (err) {
        console.error(
          `[scheduler] Failed to auto-refresh ${country}:`,
          (err as Error).message
        );
      }
    }
  }
}

/** Started once at server boot from `src/instrumentation.ts`. */
export function startScheduler(): void {
  if (globalForScheduler.__refurbSchedulerStarted) return;
  globalForScheduler.__refurbSchedulerStarted = true;

  console.log("[scheduler] Auto-refresh scheduler started");

  // A slow pass (several countries, slow network) must not overlap the next tick.
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await refreshDueCountries();
    } finally {
      running = false;
    }
  };

  // Catch up right away after a restart, then check every minute.
  void tick();
  setInterval(tick, 60 * 1000);
}
