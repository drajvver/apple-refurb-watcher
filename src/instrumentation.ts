// Runs once when the Next.js server starts, so auto-refresh works even before anyone opens the page.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  }
}
