"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import type { Product, ProductSpecs, WatcherChange } from "@/lib/types";
import { COUNTRIES, DEFAULT_COUNTRY, getCountryConfig } from "@/lib/config";

interface CountryState {
  products: Product[];
  lastChanges: WatcherChange[];
  lastFetchTimestamp: string | null;
  isFirstRun: boolean;
}

interface DashboardProps {
  initialState: CountryState;
}

type FilterTab = "all" | "new" | "changed";

type SpecKey = keyof Pick<
  ProductSpecs,
  "model" | "screenSize" | "chip" | "memory" | "storage" | "color"
>;

const SPEC_LABELS: Record<SpecKey, string> = {
  model: "Model",
  screenSize: "Screen",
  chip: "Chip",
  memory: "Memory",
  storage: "Storage",
  color: "Color",
};

const SPEC_KEYS: SpecKey[] = [
  "model",
  "screenSize",
  "chip",
  "memory",
  "storage",
  "color",
];

const REFRESH_INTERVALS = [
  { value: 15, label: "15m" },
  { value: 30, label: "30m" },
  { value: 60, label: "1h" },
  { value: 120, label: "2h" },
  { value: 360, label: "6h" },
];

function formatPrice(
  amount: number,
  currency: string,
  locale: string
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function getProductImageUrl(product: Product): string | null {
  if (!product.image) return null;
  const first = product.image.split(",")[0]?.trim()?.split(" ")[0];
  if (!first) return null;
  if (first.startsWith("//")) return `https:${first}`;
  return first;
}

export default function Dashboard({ initialState }: DashboardProps) {
  const [selectedCountry, setSelectedCountry] = useState(DEFAULT_COUNTRY);
  const [dataByCountry, setDataByCountry] = useState<
    Record<string, CountryState>
  >({
    [DEFAULT_COUNTRY]: initialState,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [selectedTags, setSelectedTags] = useState<Record<string, Set<string>>>(
    {}
  );

  // Auto-refresh state
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(60);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [now, setNow] = useState(Date.now());

  const currentData = dataByCountry[selectedCountry] ?? {
    products: [],
    lastChanges: [],
    lastFetchTimestamp: null,
    isFirstRun: true,
  };

  const countryConfig = getCountryConfig(selectedCountry);

  // Load settings when country changes
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        const config = data.autoRefresh?.[selectedCountry];
        if (config) {
          setAutoRefreshEnabled(config.enabled);
          setAutoRefreshInterval(config.intervalMinutes);
        } else {
          setAutoRefreshEnabled(false);
          setAutoRefreshInterval(60);
        }
      })
      .catch(() => {
        // ignore
      });
  }, [selectedCountry]);

  // Clock for refresh countdown
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const minutesUntilNext = useMemo(() => {
    if (!autoRefreshEnabled || !currentData.lastFetchTimestamp) return null;
    const lastFetch = new Date(currentData.lastFetchTimestamp).getTime();
    const nextFetch = lastFetch + autoRefreshInterval * 60 * 1000;
    return Math.max(0, Math.ceil((nextFetch - now) / (60 * 1000)));
  }, [autoRefreshEnabled, autoRefreshInterval, currentData.lastFetchTimestamp, now]);

  useEffect(() => {
    if (!dataByCountry[selectedCountry]) {
      refreshCountry(selectedCountry);
    }
    setActiveFilter("all");
    setSelectedTags({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCountry]);

  const toggleTag = useCallback((key: string, value: string) => {
    setSelectedTags((prev) => {
      const next = { ...prev };
      const current = next[key] ?? new Set();
      const updated = new Set(current);
      if (updated.has(value)) {
        updated.delete(value);
      } else {
        updated.add(value);
      }
      if (updated.size === 0) {
        delete next[key];
      } else {
        next[key] = updated;
      }
      return next;
    });
  }, []);

  const clearTags = useCallback(() => setSelectedTags({}), []);

  const specOptions = useMemo(() => {
    const options: Record<string, string[]> = {};
    for (const key of SPEC_KEYS) {
      const values = new Set<string>();
      for (const p of currentData.products) {
        const v = p.specs[key];
        if (v) values.add(v);
      }
      const sorted = [...values].sort();
      if (sorted.length > 0) options[key] = sorted;
    }
    return options;
  }, [currentData.products]);

  const activeTagCount = Object.values(selectedTags).reduce(
    (sum, s) => sum + s.size,
    0
  );

  const addedPartNumbers = new Set(
    currentData.lastChanges
      .filter((c) => c.type === "added")
      .map((c) => c.product.partNumber)
  );
  const removedProducts = currentData.lastChanges.filter(
    (c) => c.type === "removed"
  );
  const changedPartNumbers = new Map(
    currentData.lastChanges
      .filter((c) => c.type === "price_changed")
      .map((c) => [c.product.partNumber, c.previousPrice!])
  );

  const refreshCountry = async (countryCode: string) => {
    setIsRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/refresh?country=${countryCode}`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch products");
      }
      const data = await res.json();
      setDataByCountry((prev) => ({
        ...prev,
        [countryCode]: {
          products: data.products,
          lastChanges: data.changes,
          lastFetchTimestamp: data.timestamp,
          isFirstRun: data.isFirstRun,
        },
      }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const saveAutoRefreshSettings = async (
    enabled: boolean,
    interval: number
  ) => {
    setIsSavingSettings(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: selectedCountry,
          config: { enabled, intervalMinutes: interval },
        }),
      });
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleToggleAutoRefresh = async () => {
    const next = !autoRefreshEnabled;
    setAutoRefreshEnabled(next);
    await saveAutoRefreshSettings(next, autoRefreshInterval);
  };

  const handleIntervalChange = async (mins: number) => {
    setAutoRefreshInterval(mins);
    if (autoRefreshEnabled) {
      await saveAutoRefreshSettings(true, mins);
    }
  };

  const stats = {
    total: currentData.products.length,
    new: currentData.lastChanges.filter((c) => c.type === "added").length,
    removed: currentData.lastChanges.filter((c) => c.type === "removed")
      .length,
    priceChanged: currentData.lastChanges.filter(
      (c) => c.type === "price_changed"
    ).length,
  };

  let filteredProducts = [...currentData.products].sort(
    (a, b) => a.refurbPrice - b.refurbPrice
  );
  if (activeFilter === "new") {
    filteredProducts = filteredProducts.filter((p) =>
      addedPartNumbers.has(p.partNumber)
    );
  } else if (activeFilter === "changed") {
    filteredProducts = filteredProducts.filter((p) =>
      changedPartNumbers.has(p.partNumber)
    );
  }

  if (activeTagCount > 0) {
    filteredProducts = filteredProducts.filter((p) => {
      for (const [key, values] of Object.entries(selectedTags)) {
        const specVal = p.specs[key as SpecKey] ?? "";
        if (!values.has(specVal)) return false;
      }
      return true;
    });
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 bg-stone-900 rounded-lg">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-stone-900">
                  Apple Refurb Watcher
                </h1>
                <p className="text-xs text-stone-400">
                  {currentData.lastFetchTimestamp
                    ? `Updated ${new Date(
                        currentData.lastFetchTimestamp
                      ).toLocaleString(countryConfig.locale)}`
                    : "No data yet"}
                </p>
                {autoRefreshEnabled && minutesUntilNext !== null && (
                  <p className="text-[10px] text-emerald-600 font-medium leading-tight">
                    Auto-refresh in {minutesUntilNext}m
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                disabled={isRefreshing}
                className="text-sm border border-stone-300 rounded-lg px-3 py-2 bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent disabled:opacity-50"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>

              <label
                className="flex items-center gap-1.5 text-sm text-stone-600 cursor-pointer select-none"
                title="Automatically refresh this country's data"
              >
                <input
                  type="checkbox"
                  checked={autoRefreshEnabled}
                  onChange={handleToggleAutoRefresh}
                  disabled={isSavingSettings}
                  className="w-4 h-4 rounded border-stone-300 text-stone-900 focus:ring-stone-900"
                />
                <span className="hidden sm:inline">Auto</span>
              </label>

              {autoRefreshEnabled && (
                <select
                  value={autoRefreshInterval}
                  onChange={(e) =>
                    handleIntervalChange(Number(e.target.value))
                  }
                  disabled={isSavingSettings}
                  className="text-sm border border-stone-300 rounded-lg px-2 py-2 bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent disabled:opacity-50"
                >
                  {REFRESH_INTERVALS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}

              <button
                onClick={() => refreshCountry(selectedCountry)}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 px-4 py-2 bg-stone-900 text-white text-sm rounded-lg hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {isRefreshing ? (
                  <>
                    <svg
                      className="animate-spin h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Fetching...
                  </>
                ) : (
                  <>
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
                      />
                    </svg>
                    Refresh
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            <span className="font-medium">Error:</span> {error}
          </div>
        )}

        {currentData.lastChanges.length > 0 && (
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Total"
              value={stats.total}
              bg="bg-stone-100"
              text="text-stone-700"
            />
            <StatCard
              label="New"
              value={stats.new}
              bg="bg-emerald-50"
              text="text-emerald-700"
            />
            <StatCard
              label="Gone"
              value={stats.removed}
              bg="bg-red-50"
              text="text-red-700"
            />
            <StatCard
              label="Price Change"
              value={stats.priceChanged}
              bg="bg-amber-50"
              text="text-amber-700"
            />
          </div>
        )}

        {activeFilter === "all" && removedProducts.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-red-600 uppercase tracking-wide mb-3">
              No Longer Available ({removedProducts.length})
            </h2>
            <div className="space-y-2">
              {removedProducts.map((change) => (
                <RemovedProductRow
                  key={change.product.partNumber}
                  change={change}
                  locale={countryConfig.locale}
                />
              ))
              }
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mb-4">
          {(
            [
              {
                key: "all" as FilterTab,
                label: "All",
                count: currentData.products.length,
              },
              { key: "new" as FilterTab, label: "New", count: stats.new },
              {
                key: "changed" as FilterTab,
                label: "Price Changed",
                count: stats.priceChanged,
              },
            ] as const
          ).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeFilter === key
                  ? "bg-stone-900 text-white"
                  : "bg-white text-stone-500 hover:bg-stone-100 border border-stone-200"
              }`}
            >
              {label} <span className="opacity-60">({count})</span>
            </button>
          ))}
          {activeTagCount > 0 && (
            <button
              onClick={clearTags}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>

        {Object.keys(specOptions).length > 0 && (
          <div className="mb-6 space-y-3 bg-white border border-stone-200 rounded-xl p-4">
            {SPEC_KEYS.filter((k) => specOptions[k]).map((key) => (
              <div key={key} className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-stone-400 w-16 shrink-0">
                  {SPEC_LABELS[key]}
                </span>
                {specOptions[key].map((value) => {
                  const isSelected = selectedTags[key]?.has(value) ?? false;
                  return (
                    <button
                      key={value}
                      onClick={() => toggleTag(key, value)}
                      className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                        isSelected
                          ? "bg-stone-900 text-white"
                          : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                      }`}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {filteredProducts.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-stone-300 mb-4">
              <svg
                className="mx-auto h-12 w-12"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
                />
              </svg>
            </div>
            <p className="text-stone-400 text-sm">
              {currentData.products.length === 0
                ? "No products yet. Click Refresh to fetch from Apple's refurbished store."
                : "No products match this filter."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.partNumber}
                product={product}
                isNew={addedPartNumbers.has(product.partNumber)}
                previousPrice={changedPartNumbers.get(product.partNumber)}
                selectedTags={selectedTags}
                onTagClick={toggleTag}
                locale={countryConfig.locale}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 mt-8 border-t border-stone-200">
        <p className="text-center text-xs text-stone-400">
          Apple Refurb Watcher &middot; Data from{" "}
          <a
            href={`https://www.apple.com/${countryConfig.urlPath}/shop/refurbished/mac`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            Apple Certified Refurbished ({countryConfig.name})
          </a>
        </p>
      </footer>
    </div>
  );
}

function StatCard({
  label,
  value,
  bg,
  text,
}: {
  label: string;
  value: number;
  bg: string;
  text: string;
}) {
  return (
    <div className={`rounded-xl p-4 ${bg}`}>
      <div className={`text-2xl font-bold ${text}`}>{value}</div>
      <div className={`text-sm ${text} opacity-70`}>{label}</div>
    </div>
  );
}

function ProductCard({
  product,
  isNew,
  previousPrice,
  selectedTags,
  onTagClick,
  locale,
}: {
  product: Product;
  isNew: boolean;
  previousPrice?: number;
  selectedTags: Record<string, Set<string>>;
  onTagClick: (key: string, value: string) => void;
  locale: string;
}) {
  const imageUrl = getProductImageUrl(product);
  const specs = product.specs;
  const isPriceChanged = previousPrice !== undefined;

  return (
    <div
      className={`bg-white rounded-xl border overflow-hidden hover:shadow-lg transition-all duration-200 ${
        isNew
          ? "border-emerald-200 shadow-emerald-100 shadow-sm"
          : isPriceChanged
            ? "border-amber-200 shadow-amber-100 shadow-sm"
            : "border-stone-200"
      }`}
    >
      {(isNew || isPriceChanged) && (
        <div
          className={`text-white text-xs font-bold px-3 py-1 text-center uppercase tracking-wider ${
            isNew ? "bg-emerald-500" : "bg-amber-500"
          }`}
        >
          {isNew ? "New" : "Price Changed"}
        </div>
      )}

      {imageUrl && (
        <div className="bg-stone-50 p-6 flex justify-center">
          <img
            src={imageUrl}
            alt={product.title}
            className="h-32 object-contain"
          />
        </div>
      )}

      <div className="p-4">
        <h3 className="font-semibold text-stone-900 text-sm leading-snug mb-2 line-clamp-2">
          {specs.model || product.title}
        </h3>

        <div className="flex flex-wrap gap-1 mb-4">
          {(
            [
              ["screenSize", specs.screenSize],
              ["chip", specs.chip],
              ["memory", specs.memory],
              ["storage", specs.storage],
              ["color", specs.color],
            ] as [string, string][]
          )
            .filter(([, v]) => Boolean(v))
            .map(([key, val]) => {
              const isActive = selectedTags[key]?.has(val) ?? false;
              return (
                <button
                  key={key}
                  onClick={() => onTagClick(key, val)}
                  className={`inline-block text-xs px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                    isActive
                      ? "bg-stone-900 text-white"
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}
                >
                  {val}
                </button>
              );
            })}
        </div>

        <div className="flex items-end justify-between">
          <div>
            <div className="text-xl font-bold text-stone-900">
              {formatPrice(product.refurbPrice, product.currency, locale)}
            </div>
            {product.originalPrice && (
              <div className="text-sm text-stone-400 line-through">
                {formatPrice(product.originalPrice, product.currency, locale)}
              </div>
            )}
            {isPriceChanged && (
              <div className="text-xs text-amber-600 font-medium mt-0.5">
                was {formatPrice(previousPrice, product.currency, locale)}
              </div>
            )}
          </div>
          {product.savingsPercent !== null && (
            <span className="text-sm font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">
              -{product.savingsPercent}%
            </span>
          )}
        </div>

        <a
          href={product.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center justify-center gap-1 w-full text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 py-2 rounded-lg transition-colors"
        >
          View on Apple Store
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
            />
          </svg>
        </a>
      </div>
    </div>
  );
}

function RemovedProductRow({
  change,
  locale,
}: {
  change: WatcherChange;
  locale: string;
}) {
  const s = change.product.specs;
  const summary = [s.model, s.screenSize, s.chip, s.memory, s.storage, s.color]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-center justify-between bg-white border border-red-100 rounded-lg px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold text-red-500 uppercase tracking-wide">
          Removed
        </span>
        <span className="text-sm text-stone-600">
          {summary || change.product.title}
        </span>
      </div>
      <span className="text-sm text-stone-400 line-through">
        {formatPrice(change.product.refurbPrice, change.product.currency, locale)}
      </span>
    </div>
  );
}
