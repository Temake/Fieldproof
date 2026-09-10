import Link from "next/link";
import { notFound } from "next/navigation";
import { api, money } from "@/lib/api";
import { StatusPill } from "@/components/StatusPill";
import { Timeline } from "@/components/Timeline";
import { EvidenceGraph } from "@/components/EvidenceGraph";

export const dynamic = "force-dynamic";

/** PRD 14 Screen 2 + Screen 4. */
export default async function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const [state, metrics] = await Promise.all([api.job(jobId), api.metrics(jobId)]).catch(
    () => [null, null] as const,
  );
  if (!state || !metrics) notFound();

  const pending = state.decisions.filter((d) => d.status === "PENDING");

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{state.job.id}</h1>
          <p className="text-sm text-[var(--color-muted)]">{state.job.description}</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {state.job.technician_name ?? state.job.technician_id} · {state.job.site_address}
          </p>
        </div>
        <div className="text-right">
          <StatusPill status={state.job.status} />
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            authorized {money(state.job.authorized_amount)}
            {state.job.final_amount != null && ` · final ${money(state.job.final_amount)}`}
          </p>
        </div>
      </header>

      {pending.map((decision) => (
        <Link
          key={decision.id}
          href={`/decisions/${decision.id}`}
          className="block rounded-xl border border-red-200 bg-red-50 p-4 hover:bg-red-100"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-blocking)]">
            Decision required
          </p>
          <p className="mt-1 text-sm">{decision.question}</p>
        </Link>
      ))}

      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Timeline
          </h2>
          <Timeline events={state.events} />
        </section>

        <aside className="space-y-6">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              This job
            </h2>
            <dl className="rounded-xl border border-[var(--color-line)] bg-white p-4 text-sm">
              <Row label="Workflow steps" value={metrics.workflow_steps} />
              <Row label="Handled autonomously" value={metrics.handled_autonomously} />
              <Row label="Technician interactions" value={metrics.technician_interactions} />
              <Row label="Supervisor decisions" value={metrics.supervisor_decisions} />
              <Row label="Manual document reviews" value={metrics.manual_document_reviews} />
            </dl>
          </section>

          {state.job.status === "CLOSED" && (
            <Link
              href={`/jobs/${jobId}/receipt`}
              className="block rounded-xl border border-[var(--color-line)] bg-white p-4 text-sm hover:bg-slate-50"
            >
              View evidence receipt →
            </Link>
          )}
        </aside>
      </div>

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Evidence graph
        </h2>
        <EvidenceGraph state={state} />
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between border-b border-[var(--color-line)] py-2 last:border-0">
      <dt className="text-[var(--color-muted)]">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
