import Link from "next/link";
import { api } from "@/lib/api";
import { StatusPill } from "@/components/StatusPill";

export const dynamic = "force-dynamic";

/** PRD 14 Screen 1 - Operations Dashboard. */
export default async function DashboardPage() {
  const [counts, jobs] = await Promise.all([api.dashboard(), api.jobs()]).catch(() => [
    null,
    [],
  ] as const);

  if (!counts) {
    return (
      <p className="text-sm text-[var(--color-muted)]">
        API unreachable. Start it with <code>make api</code>.
      </p>
    );
  }

  const cards = [
    { label: "Processing", value: counts.processing },
    { label: "Closed automatically", value: counts.closed_automatically },
    { label: "Waiting on technician", value: counts.waiting_on_technician },
    { label: "Decision required", value: counts.decision_required, accent: true },
  ];

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`rounded-xl border bg-white p-5 ${
              card.accent && card.value > 0
                ? "border-red-200 ring-1 ring-red-100"
                : "border-[var(--color-line)]"
            }`}
          >
            <p className="text-3xl font-semibold tabular-nums">{card.value}</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{card.label}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Jobs
        </h2>
        <div className="overflow-hidden rounded-xl border border-[var(--color-line)] bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-line)] text-left text-xs uppercase tracking-wider text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Job</th>
                <th className="px-4 py-3 font-medium">Work</th>
                <th className="px-4 py-3 font-medium">Technician</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/jobs/${job.id}`} className="hover:underline">
                      {job.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">{job.description}</td>
                  <td className="px-4 py-3">{job.technician_name ?? job.technician_id}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={job.status} />
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-[var(--color-muted)]">
                    No jobs yet. Seed one with <code>make seed</code>.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
