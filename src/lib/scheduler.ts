import { loadSettings } from "./settings";
import { loadState, fetchAndDetectChanges } from "./watcher";
import { fetchProducts } from "./scraper";
import { COUNTRIES } from "./config";

let schedulerStarted = false;

export function startScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  console.log("[scheduler] Auto-refresh scheduler started");

  // Check every minute if any country needs a refresh
  setInterval(async () => {
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
  }, 60 * 1000);
}
