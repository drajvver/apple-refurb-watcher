import { NextResponse } from "next/server";
import { loadSettings, setAutoRefreshConfig, AutoRefreshConfig } from "@/lib/settings";
import { COUNTRIES } from "@/lib/config";

export async function GET() {
  return NextResponse.json(loadSettings());
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { country, config }: { country: string; config?: AutoRefreshConfig } =
      body;

    if (!COUNTRIES.some((c) => c.code === country)) {
      return NextResponse.json({ error: "Invalid country" }, { status: 400 });
    }

    if (typeof config?.enabled !== "boolean") {
      return NextResponse.json(
        { error: "Invalid enabled value" },
        { status: 400 }
      );
    }

    if (
      typeof config.intervalMinutes !== "number" ||
      !Number.isFinite(config.intervalMinutes) ||
      config.intervalMinutes < 1
    ) {
      return NextResponse.json(
        { error: "Invalid interval" },
        { status: 400 }
      );
    }

    // Store only the known fields, not whatever else the client sent.
    setAutoRefreshConfig(country, {
      enabled: config.enabled,
      intervalMinutes: Math.round(config.intervalMinutes),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}
