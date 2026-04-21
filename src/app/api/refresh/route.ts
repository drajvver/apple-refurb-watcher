import { NextResponse } from "next/server";
import { fetchProducts } from "@/lib/scraper";
import { fetchAndDetectChanges } from "@/lib/watcher";
import { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/config";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country") || DEFAULT_COUNTRY;

  if (!COUNTRIES.some((c) => c.code === country)) {
    return NextResponse.json({ error: "Invalid country" }, { status: 400 });
  }

  try {
    const result = await fetchAndDetectChanges(
      () => fetchProducts(country),
      country
    );
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
