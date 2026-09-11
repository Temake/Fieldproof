import type { Metadata } from "next";
import { ApiUnavailable } from "@/components/ApiUnavailable";
import { DashboardLive } from "@/components/DashboardLive";
import { load, serverApi } from "@/lib/api/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Operations" };

/** PRD 14 Screen 1 - Operations Dashboard. */
export default async function DashboardPage() {
  const result = await load(
    Promise.all([serverApi.dashboard(), serverApi.jobs(), serverApi.decisions("PENDING")]),
  );

  if (!result.ok) {
    return (
      <div className="space-y-6">
        <h1 className="text-title text-ink">Operations</h1>
        <ApiUnavailable error={result.error} what="the operations dashboard" />
      </div>
    );
  }

  const [counts, jobs, decisions] = result.data;
  return <DashboardLive initial={{ counts, jobs, decisions }} />;
}
