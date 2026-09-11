import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApiUnavailable } from "@/components/ApiUnavailable";
import { JobLive } from "@/components/JobLive";
import { load, serverApi } from "@/lib/api/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ jobId: string }> }): Promise<Metadata> {
  const { jobId } = await params;
  return { title: jobId };
}

/** PRD 14 Screens 2 and 4 - live timeline, requirement graph, runs. */
export default async function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  // The job read decides 404; metrics has no not-found handling of its own.
  const [job, metrics] = await Promise.all([load(serverApi.job(jobId)), load(serverApi.metrics(jobId))]);

  if (!job.ok) {
    if (job.error.isNotFound) notFound();
    return <ApiUnavailable error={job.error} what={`job ${jobId}`} />;
  }
  if (!metrics.ok) return <ApiUnavailable error={metrics.error} what={`metrics for ${jobId}`} />;

  return <JobLive initial={{ state: job.data, metrics: metrics.data }} />;
}
