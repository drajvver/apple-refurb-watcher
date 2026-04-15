import { NextResponse } from "next/server";
import { fetchProducts } from "@/lib/scraper";
import { fetchAndDetectChanges } from "@/lib/watcher";

export async function POST() {
  try {
    const result = await fetchAndDetectChanges(fetchProducts);
    return NextResponse.json({
      products: result.currentProducts,
      changes: result.changes,
      timestamp: result.timestamp,
      isFirstRun: result.isFirstRun,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
