export interface ProductSpecs {
  model: string;
  screenSize: string;
  chip: string;
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

export interface ProductSnapshot {
  timestamp: string;
  products: Product[];
}

export interface WatcherChange {
  type: "added" | "removed" | "price_changed";
  product: Product;
  previousPrice?: number;
}

export interface WatcherResult {
  timestamp: string;
  changes: WatcherChange[];
  currentProducts: Product[];
  isFirstRun: boolean;
}
