import fs from "fs";
import { Product, WatcherChange, AppState } from "./types";
import { DATA_DIR, STATE_FILE } from "./config";

export function loadState(): AppState | null {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(state: AppState): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
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
  fetchFn: () => Promise<Product[]>
): Promise<{
  timestamp: string;
  changes: WatcherChange[];
  currentProducts: Product[];
  isFirstRun: boolean;
}> {
  const currentProducts = await fetchFn();
  const timestamp = new Date().toISOString();

  const previous = loadState();
  const isFirstRun = !previous;
  const changes = previous
    ? compareProducts(previous.products, currentProducts)
    : [];

  saveState({
    lastFetchTimestamp: timestamp,
    products: currentProducts,
    lastChanges: changes,
  });

  return { timestamp, changes, currentProducts, isFirstRun };
}
