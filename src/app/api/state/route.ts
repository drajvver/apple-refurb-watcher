import { NextResponse } from "next/server";
import { getDashboardState } from "@/lib/watcher";
import { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/config";

// Returns the saved state for a country without scraping Apple.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country") || DEFAULT_COUNTRY;

  if (!COUNTRIES.some((c) => c.code === country)) {
    return NextResponse.json({ error: "Invalid country" }, { status: 400 });
  }

  return NextResponse.json(getDashboardState(country));
}
