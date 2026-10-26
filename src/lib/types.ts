export interface ProductSpecs {
  model: string;
  screenSize: string;
  chip: string;
  /** CPU/GPU core counts, e.g. "10C CPU / 8C GPU". Missing in state saved by older versions. */
  cores?: string;
  memory: string;
  storage: string;
  color: string;
  year: string;
}

export interface Product {
  partNumber: string;
  title: string;
  url: string;
  refurbPrice: number;
  originalPrice: number | null;
  savings: number | null;
  savingsPercent: number | null;
  currency: string;
  image?: string;
  specs: ProductSpecs;
}

export interface WatcherChange {
  type: "added" | "removed" | "price_changed";
  product: Product;
  previousPrice?: number;
  /** ISO timestamp of the refresh that detected the change. */
  detectedAt?: string;
}

export interface AppState {
  countryCode: string;
  lastFetchTimestamp: string;
  products: Product[];
  /** Changes detected by the most recent refresh only. */
  lastChanges: WatcherChange[];
  /** Changes merged across refreshes within CHANGE_WINDOW_HOURS. */
  recentChanges?: WatcherChange[];
}

export interface PricePoint {
  /** ISO timestamp of the refresh that first saw this price. */
  at: string;
  price: number;
}

/** A product's recorded prices. A point is stored only when the price changes. */
export interface PriceHistory {
  firstSeen: string;
  lowest: number;
  highest: number;
  points: PricePoint[];
}

/** State shape handed to the dashboard, both on first render and from the API. */
export interface DashboardState {
  products: Product[];
  recentChanges: WatcherChange[];
  lastFetchTimestamp: string | null;
  isFirstRun: boolean;
  /** Keyed by part number; covers current and recently removed products. */
  priceHistory: Record<string, PriceHistory>;
  /** When price tracking began for this country. Products first seen then have an unknown listing date. */
  trackingSince: string | null;
}
