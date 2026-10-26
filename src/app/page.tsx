import Dashboard from "@/components/Dashboard";
import { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/config";
import { getDashboardState } from "@/lib/watcher";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ country?: string | string[] }>;
}) {
  const { country: requested } = await searchParams;
  const country =
    typeof requested === "string" && COUNTRIES.some((c) => c.code === requested)
      ? requested
      : DEFAULT_COUNTRY;

  return (
    <Dashboard
      initialCountry={country}
      initialState={getDashboardState(country)}
    />
  );
}
