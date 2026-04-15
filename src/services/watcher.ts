import * as fs from "fs";
import * as path from "path";
import { Product, ProductSnapshot, WatcherChange, WatcherResult } from "../types/product";
import { STATE_DIR, STATE_FILE } from "../config";

function loadState(): ProductSnapshot | null {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(snapshot: ProductSnapshot): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(snapshot, null, 2), "utf-8");
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
): Promise<WatcherResult> {
  const currentProducts = await fetchFn();
  const timestamp = new Date().toISOString();

  const previous = loadState();
  const isFirstRun = !previous;
  const changes = previous
    ? compareProducts(previous.products, currentProducts)
    : [];

  saveState({ timestamp, products: currentProducts });

  return { timestamp, changes, currentProducts, isFirstRun };
}
