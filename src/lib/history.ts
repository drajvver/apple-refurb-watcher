import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR } from "./config";
import type { PriceHistory, Product } from "./types";

// Price history lives in a SQLite file next to the JSON state, so a single
// volume mounted at data/ persists everything. Uses Node's built-in driver:
// no native dependency to build or keep up to date.
const DB_FILE = path.join(DATA_DIR, "history.db");

/** Points kept per product in API responses (the database keeps everything). */
const MAX_POINTS_PER_PRODUCT = 50;

// Append-only list: each entry upgrades the schema by one version (PRAGMA user_version).
const MIGRATIONS = [
  `CREATE TABLE price_points (
     country TEXT NOT NULL,
     part_number TEXT NOT NULL,
     price REAL NOT NULL,
     observed_at TEXT NOT NULL
   );
   CREATE INDEX price_points_by_product
     ON price_points (country, part_number, observed_at);`,
];

// One connection per process, shared across module instances and hot reloads.
const globalForHistory = globalThis as typeof globalThis & {
  __refurbHistoryDb?: DatabaseSync;
};

function migrate(db: DatabaseSync): void {
  const { user_version } = db.prepare("PRAGMA user_version").get() as {
    user_version: number;
  };
  for (let version = user_version; version < MIGRATIONS.length; version++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

function getDb(): DatabaseSync {
  if (!globalForHistory.__refurbHistoryDb) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const db = new DatabaseSync(DB_FILE);
    db.exec("PRAGMA busy_timeout = 5000");
    migrate(db);
    globalForHistory.__refurbHistoryDb = db;
  }
  return globalForHistory.__refurbHistoryDb;
}

/** Store a price point for every product that is new or whose price moved since its last point. */
export function recordPrices(
  country: string,
  products: Product[],
  observedAt: string
): void {
  try {
    const db = getDb();
    const latest = db
      .prepare(
        `SELECT part_number, price FROM (
           SELECT part_number, price,
                  ROW_NUMBER() OVER (PARTITION BY part_number ORDER BY observed_at DESC) AS rn
           FROM price_points WHERE country = ?
         ) WHERE rn = 1`
      )
      .all(country) as { part_number: string; price: number }[];
    const lastPrice = new Map(latest.map((row) => [row.part_number, row.price]));

    const insert = db.prepare(
      "INSERT INTO price_points (country, part_number, price, observed_at) VALUES (?, ?, ?, ?)"
    );
    db.exec("BEGIN");
    try {
      for (const product of products) {
        if (lastPrice.get(product.partNumber) !== product.refurbPrice) {
          insert.run(country, product.partNumber, product.refurbPrice, observedAt);
        }
      }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  } catch (err) {
    // History is a bonus; never fail a refresh over it.
    console.error("[history] Failed to record prices:", (err as Error).message);
  }
}

export function getPriceHistory(
  country: string,
  partNumbers: Iterable<string>
): { priceHistory: Record<string, PriceHistory>; trackingSince: string | null } {
  const wanted = new Set(partNumbers);
  try {
    const db = getDb();
    const { since } = db
      .prepare("SELECT MIN(observed_at) AS since FROM price_points WHERE country = ?")
      .get(country) as { since: string | null };
    const rows = db
      .prepare(
        `SELECT part_number, price, observed_at FROM price_points
         WHERE country = ? ORDER BY part_number, observed_at`
      )
      .all(country) as { part_number: string; price: number; observed_at: string }[];

    const priceHistory: Record<string, PriceHistory> = {};
    for (const row of rows) {
      if (!wanted.has(row.part_number)) continue;
      const point = { at: row.observed_at, price: row.price };
      const history = priceHistory[row.part_number];
      if (!history) {
        priceHistory[row.part_number] = {
          firstSeen: row.observed_at,
          lowest: row.price,
          highest: row.price,
          points: [point],
        };
      } else {
        history.lowest = Math.min(history.lowest, row.price);
        history.highest = Math.max(history.highest, row.price);
        history.points.push(point);
      }
    }
    for (const history of Object.values(priceHistory)) {
      history.points = history.points.slice(-MAX_POINTS_PER_PRODUCT);
    }
    return { priceHistory, trackingSince: since };
  } catch (err) {
    console.error("[history] Failed to read price history:", (err as Error).message);
    return { priceHistory: {}, trackingSince: null };
  }
}

/** For the health check: can the history database be opened and queried? */
export function isHistoryDbHealthy(): boolean {
  try {
    getDb().prepare("SELECT 1").get();
    return true;
  } catch {
    return false;
  }
}
