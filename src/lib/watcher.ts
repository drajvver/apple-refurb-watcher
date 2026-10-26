import { Product, WatcherChange, AppState, DashboardState } from "./types";
import {
  getStateFile,
  DEFAULT_COUNTRY,
  LEGACY_STATE_FILE,
  CHANGE_WINDOW_HOURS,
} from "./config";
import { readJson, writeJsonAtomic } from "./storage";

export interface RefreshResult {
  timestamp: string;
  /** Changes detected by this refresh only. */
  changes: WatcherChange[];
  /** Changes within CHANGE_WINDOW_HOURS, including this refresh. */
  recentChanges: WatcherChange[];
  currentProducts: Product[];
  isFirstRun: boolean;
}

export function loadState(country: string = DEFAULT_COUNTRY): AppState | null {
  try {
    const state = readJson<AppState>(getStateFile(country));
    if (state) return state;

    // Fallback to legacy state.json for Poland
    if (country === DEFAULT_COUNTRY) {
      const legacy = readJson<AppState>(LEGACY_STATE_FILE);
      if (legacy) {
        const migrated = { ...legacy, countryCode: country };
        writeJsonAtomic(getStateFile(country), migrated);
        return migrated;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** State files written before change history existed only have `lastChanges`. */
function getRecentChanges(state: AppState): WatcherChange[] {
  return (
    state.recentChanges ??
    (state.lastChanges ?? []).map((c) => ({
      ...c,
      detectedAt: c.detectedAt ?? state.lastFetchTimestamp,
    }))
  );
}

export function getDashboardState(country: string = DEFAULT_COUNTRY): DashboardState {
  const state = loadState(country);
  if (!state) {
    return {
      products: [],
      recentChanges: [],
      lastFetchTimestamp: null,
      isFirstRun: true,
    };
  }
  return {
    products: state.products ?? [],
    recentChanges: getRecentChanges(state),
    lastFetchTimestamp: state.lastFetchTimestamp ?? null,
    isFirstRun: false,
  };
}

function compareProducts(
  previous: Product[],
  current: Product[],
  detectedAt: string
): WatcherChange[] {
  const changes: WatcherChange[] = [];

  const prevMap = new Map(previous.map((p) => [p.partNumber, p]));
  const currMap = new Map(current.map((p) => [p.partNumber, p]));

  for (const [partNum, product] of currMap) {
    if (!prevMap.has(partNum)) {
      changes.push({ type: "added", product, detectedAt });
    } else {
      const prev = prevMap.get(partNum)!;
      if (prev.refurbPrice !== product.refurbPrice) {
        changes.push({
          type: "price_changed",
          product,
          previousPrice: prev.refurbPrice,
          detectedAt,
        });
      }
    }
  }

  for (const [partNum, product] of prevMap) {
    if (!currMap.has(partNum)) {
      changes.push({ type: "removed", product, detectedAt });
    }
  }

  return changes;
}

/**
 * Fold this refresh's changes into the rolling window, so frequent auto-refreshes
 * don't wipe out a "new" badge minutes after it appeared. One entry per product.
 */
function mergeRecentChanges(
  previous: WatcherChange[],
  fresh: WatcherChange[],
  timestamp: string
): WatcherChange[] {
  const cutoff = new Date(timestamp).getTime() - CHANGE_WINDOW_HOURS * 60 * 60 * 1000;
  const merged = new Map<string, WatcherChange>();

  for (const change of previous) {
    if (change.detectedAt && new Date(change.detectedAt).getTime() >= cutoff) {
      merged.set(change.product.partNumber, change);
    }
  }

  for (const change of fresh) {
    const key = change.product.partNumber;
    const earlier = merged.get(key);

    if (change.type === "price_changed" && earlier?.type === "added") {
      // Still a new arrival: keep its detection time, update the price.
      merged.set(key, { ...earlier, product: change.product });
    } else if (change.type === "price_changed" && earlier?.type === "price_changed") {
      // Report against the price before the first change in the window.
      if (earlier.previousPrice === change.product.refurbPrice) {
        merged.delete(key);
      } else {
        merged.set(key, { ...change, previousPrice: earlier.previousPrice });
      }
    } else {
      // Latest event wins: a restock after "removed" is a new arrival again.
      merged.set(key, change);
    }
  }

  return [...merged.values()];
}

async function runRefresh(
  fetchFn: () => Promise<Product[]>,
  country: string
): Promise<RefreshResult> {
  const currentProducts = await fetchFn();
  const timestamp = new Date().toISOString();

  const previous = loadState(country);
  const isFirstRun = !previous;
  const changes = previous
    ? compareProducts(previous.products, currentProducts, timestamp)
    : [];
  const recentChanges = previous
    ? mergeRecentChanges(getRecentChanges(previous), changes, timestamp)
    : [];

  const state: AppState = {
    countryCode: country,
    lastFetchTimestamp: timestamp,
    products: currentProducts,
    lastChanges: changes,
    recentChanges,
  };
  writeJsonAtomic(getStateFile(country), state);

  return { timestamp, changes, recentChanges, currentProducts, isFirstRun };
}

// Shared across module instances (route handlers and the scheduler may be bundled separately).
const globalForWatcher = globalThis as typeof globalThis & {
  __refurbRefreshesInFlight?: Map<string, Promise<RefreshResult>>;
};
const inFlight = (globalForWatcher.__refurbRefreshesInFlight ??= new Map());

/**
 * Scrape, diff against the saved state, and persist. Concurrent calls for the same
 * country (manual refresh + scheduler) share one run instead of racing on the state file.
 */
export function fetchAndDetectChanges(
  fetchFn: () => Promise<Product[]>,
  country: string = DEFAULT_COUNTRY
): Promise<RefreshResult> {
  const running = inFlight.get(country);
  if (running) return running;

  const run = runRefresh(fetchFn, country).finally(() => inFlight.delete(country));
  inFlight.set(country, run);
  return run;
}
