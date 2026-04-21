import { NextResponse } from "next/server";
import { loadSettings, saveSettings, AutoRefreshConfig } from "@/lib/settings";
import { COUNTRIES } from "@/lib/config";

export async function GET() {
  return NextResponse.json(loadSettings());
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { country, config }: { country: string; config: AutoRefreshConfig } =
      body;

    if (!COUNTRIES.some((c) => c.code === country)) {
      return NextResponse.json({ error: "Invalid country" }, { status: 400 });
    }

    if (typeof config.enabled !== "boolean") {
      return NextResponse.json(
        { error: "Invalid enabled value" },
        { status: 400 }
      );
    }

    if (
      typeof config.intervalMinutes !== "number" ||
      config.intervalMinutes < 1
    ) {
      return NextResponse.json(
        { error: "Invalid interval" },
        { status: 400 }
      );
    }

    const settings = loadSettings();
    settings.autoRefresh[country] = config;
    saveSettings(settings);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}
