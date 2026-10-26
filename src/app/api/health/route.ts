import { NextResponse } from "next/server";
import { isHistoryDbHealthy } from "@/lib/history";

// Liveness/startup probe for Magic Containers. Answers 200 while the server is up;
// a broken history database is reported as "degraded" rather than failing the
// probe, since restarting the container would not fix a volume problem.
export function GET() {
  const historyDb = isHistoryDbHealthy();
  return NextResponse.json(
    {
      status: historyDb ? "ok" : "degraded",
      version: process.env.APP_VERSION ?? "dev",
      uptimeSeconds: Math.round(process.uptime()),
      historyDb: historyDb ? "ok" : "unavailable",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
