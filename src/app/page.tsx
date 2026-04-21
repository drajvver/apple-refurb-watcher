import fs from "fs";
import Dashboard from "@/components/Dashboard";
import { getStateFile, DEFAULT_COUNTRY, LEGACY_STATE_FILE } from "@/lib/config";
import type { Product, WatcherChange } from "@/lib/types";

interface PageState {
  products: Product[];
  lastChanges: WatcherChange[];
  lastFetchTimestamp: string | null;
  isFirstRun: boolean;
}

function getInitialState(country: string = DEFAULT_COUNTRY): PageState {
  try {
    const file = getStateFile(country);
    if (!fs.existsSync(file)) {
      // Fallback to legacy state.json for Poland
      if (country === DEFAULT_COUNTRY && fs.existsSync(LEGACY_STATE_FILE)) {
        const raw = fs.readFileSync(LEGACY_STATE_FILE, "utf-8");
        const state = JSON.parse(raw);
        return {
          products: state.products ?? [],
          lastChanges: state.lastChanges ?? [],
          lastFetchTimestamp: state.lastFetchTimestamp ?? null,
          isFirstRun: false,
        };
      }
      return {
        products: [],
        lastChanges: [],
        lastFetchTimestamp: null,
        isFirstRun: true,
      };
    }
    const raw = fs.readFileSync(file, "utf-8");
    const state = JSON.parse(raw);
    return {
      products: state.products ?? [],
      lastChanges: state.lastChanges ?? [],
      lastFetchTimestamp: state.lastFetchTimestamp ?? null,
      isFirstRun: false,
    };
  } catch {
    return {
      products: [],
      lastChanges: [],
      lastFetchTimestamp: null,
      isFirstRun: true,
    };
  }
}

export const dynamic = "force-dynamic";

export default function Home() {
  const initialState = getInitialState(DEFAULT_COUNTRY);
  return <Dashboard initialState={initialState} />;
}
