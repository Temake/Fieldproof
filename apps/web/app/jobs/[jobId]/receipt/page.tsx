import { notFound } from "next/navigation";
import { api, money } from "@/lib/api";
import { StatusPill } from "@/components/StatusPill";

export const dynamic = "force-dynamic";

/**
 * PRD 14 Screen 5 - the final proof page.
 *
 * Its job is to answer "why did this close" without anyone having to trust
 * FieldProof: every requirement names the claims behind it, every conflict
 * names its resolution, and the hash makes the record tamper-evident.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const receipt = await api.receipt(jobId).catch(() => null);
  if (!receipt) notFound();

  return (
    <article className="space-y-6 rounded-xl border border-[var(--color-line)] bg-white p-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{receipt.receipt_id}</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Job {receipt.job_id} · {new Date(receipt.generated_at).toLocaleString()}
          </p>
        </div>
        <div className="text-right">
          <StatusPill status={receipt.result} />
          <p className="mt-2 text-sm font-semibold">{money(receipt.final_amount)}</p>
        </div>
      </header>

      <Section title={`Requirements (${receipt.requirements.verified}/${receipt.requirements.total} verified)`}>
        <ul className="space-y-1 text-sm">
          {receipt.requirements.detail.map((r) => (
            <li key={r.id} className="flex items-baseline justify-between gap-4">
              <span>{r.description}</span>
              <StatusPill status={r.status} />
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Conflicts">
        {receipt.conflicts.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">None.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {receipt.conflicts.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-4">
                <span>{c.type.replaceAll("_", " ")}</span>
                <span className="text-[var(--color-muted)]">{c.resolution}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Human decisions">
        {receipt.decisions.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">
            None. This job closed without human involvement.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {receipt.decisions.map((d) => (
              <li key={d.id}>
                {d.question} — <span className="font-medium">{d.decision}</span> by {d.decided_by}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Actions">
        <p className="text-sm">{receipt.actions.join(" · ")}</p>
      </Section>

      <footer className="border-t border-[var(--color-line)] pt-4">
        <p className="text-xs text-[var(--color-muted)]">
          SHA-256 of the canonicalized receipt — any later edit changes this value.
        </p>
        <p className="mt-1 break-all font-mono text-xs">{receipt.sha256}</p>
      </footer>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        {title}
      </h2>
      {children}
    </section>
  );
}
