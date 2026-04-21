import fs from "fs";
import { Product, WatcherChange, AppState } from "./types";
import { DATA_DIR, getStateFile, DEFAULT_COUNTRY, LEGACY_STATE_FILE } from "./config";

export function loadState(country: string = DEFAULT_COUNTRY): AppState | null {
  try {
    const file = getStateFile(country);
    if (!fs.existsSync(file)) {
      // Fallback to legacy state.json for Poland
      if (country === DEFAULT_COUNTRY && fs.existsSync(LEGACY_STATE_FILE)) {
        const raw = fs.readFileSync(LEGACY_STATE_FILE, "utf-8");
        const state = JSON.parse(raw) as AppState;
        // Migrate to new file format
        fs.writeFileSync(
          file,
          JSON.stringify({ ...state, countryCode: country }, null, 2),
          "utf-8"
        );
        return { ...state, countryCode: country };
      }
      return null;
    }
    const raw = fs.readFileSync(file, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(state: AppState, country: string = DEFAULT_COUNTRY): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    getStateFile(country),
    JSON.stringify(state, null, 2),
    "utf-8"
  );
}

function compareProducts(
  previous: Product[],
  current: Product[]
): WatcherChange[] {
  const changes: WatcherChange[] = [];

  const prevMap = new Map(previous.map((p) => [p.partNumber, p]));
  const currMap = new Map(current.map((p) => [p.partNumber, p]));

  for (const [partNum, product] of currMap) {
    if (!prevMap.has(partNum)) {
      changes.push({ type: "added", product });
    } else {
      const prev = prevMap.get(partNum)!;
      if (prev.refurbPrice !== product.refurbPrice) {
        changes.push({
          type: "price_changed",
          product,
          previousPrice: prev.refurbPrice,
        });
      }
    }
  }

  for (const [partNum, product] of prevMap) {
    if (!currMap.has(partNum)) {
      changes.push({ type: "removed", product });
    }
  }

  return changes;
}

export async function fetchAndDetectChanges(
  fetchFn: () => Promise<Product[]>,
  country: string = DEFAULT_COUNTRY
): Promise<{
  timestamp: string;
  changes: WatcherChange[];
  currentProducts: Product[];
  isFirstRun: boolean;
}> {
  const currentProducts = await fetchFn();
  const timestamp = new Date().toISOString();

  const previous = loadState(country);
  const isFirstRun = !previous;
  const changes = previous
    ? compareProducts(previous.products, currentProducts)
    : [];

  saveState(
    {
      countryCode: country,
      lastFetchTimestamp: timestamp,
      products: currentProducts,
      lastChanges: changes,
    },
    country
  );

  return { timestamp, changes, currentProducts, isFirstRun };
}
