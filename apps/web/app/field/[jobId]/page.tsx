import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApiUnavailable } from "@/components/ApiUnavailable";
import { FieldJob } from "@/components/field/FieldJob";
import { load, serverApi } from "@/lib/api/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ jobId: string }> }): Promise<Metadata> {
  const { jobId } = await params;
  return { title: `Technician · ${jobId}` };
}

/** The technician's side of PRD 10: upload, complete, walk away. */
export default async function FieldPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const result = await load(serverApi.job(jobId));
  if (!result.ok) {
    if (result.error.isNotFound) notFound();
    return (
      <main id="main" className="mx-auto max-w-2xl px-4 py-10">
        <ApiUnavailable error={result.error} what="this job" />
      </main>
    );
  }
  return <FieldJob initial={result.data} />;
}
