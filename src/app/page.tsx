import fs from "fs";
import Dashboard from "@/components/Dashboard";
import { STATE_FILE } from "@/lib/config";
import type { Product, WatcherChange } from "@/lib/types";

interface PageState {
  products: Product[];
  lastChanges: WatcherChange[];
  lastFetchTimestamp: string | null;
  isFirstRun: boolean;
}

function getInitialState(): PageState {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return {
        products: [],
        lastChanges: [],
        lastFetchTimestamp: null,
        isFirstRun: true,
      };
    }
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
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
  const initialState = getInitialState();
  return <Dashboard initialState={initialState} />;
}
