import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { CaretRight, SealCheck, Warning } from "@phosphor-icons/react/dist/ssr";
import { ApiUnavailable } from "@/components/ApiUnavailable";
import { StatusPill } from "@/components/StatusPill";
import { VerifyReceipt } from "@/components/VerifyReceipt";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { load, serverApi } from "@/lib/api/server";
import { dateTime, money, percent, shortHash } from "@/lib/format";
import { CLAIM_TYPE, CONFLICT_TYPE, DECISION_ACTION, EVIDENCE_TYPE, RESOLUTION, actionLabel } from "@/lib/vocabulary";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ jobId: string }> }): Promise<Metadata> {
  const { jobId } = await params;
  return { title: `Receipt ${jobId}` };
}

/**
 * PRD 14 Screen 5 - the final proof page.
 *
 * Its job is to answer "why did this close" without anyone having to trust
 * FieldProof: every requirement names the claims behind it, every conflict
 * names its resolution, and the hash makes the record tamper-evident.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const result = await load(serverApi.receipt(jobId));
  if (!result.ok) {
    if (result.error.isNotFound) notFound();
    return <ApiUnavailable error={result.error} what="this receipt" />;
  }
  const receipt = result.data;
  const sealed = !receipt.provisional;

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="no-print flex items-center gap-1.5 text-caption text-muted">
        <Link href="/dashboard" className="hover:text-ink hover:underline">
          Operations
        </Link>
        <CaretRight aria-hidden className="size-3" />
        <Link href={`/jobs/${receipt.job_id}`} className="font-mono hover:text-ink hover:underline">
          {receipt.job_id}
        </Link>
        <CaretRight aria-hidden className="size-3" />
        <span aria-current="page">Receipt</span>
      </nav>

      <article className="mx-auto max-w-4xl overflow-hidden rounded-panel border border-line bg-surface shadow-raised">
        <header className="relative border-b border-line px-6 pt-7 pb-6 sm:px-10 sm:pt-10">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-caption font-semibold text-muted">Evidence receipt</p>
              <h1 className="mt-1 font-mono text-[1.75rem] font-bold tracking-tight text-ink sm:text-[2rem]">{receipt.receipt_id}</h1>
              <p className="mt-2 text-caption text-muted">
                Job <span className="font-mono font-semibold text-ink-2">{receipt.job_id}</span>, generated{" "}
                {dateTime(receipt.generated_at)}
              </p>
            </div>
            <div
              className={
                sealed
                  ? "flex -rotate-3 items-center gap-2 rounded-control border-2 border-verified px-4 py-2 text-verified"
                  : "flex -rotate-3 items-center gap-2 rounded-control border-2 border-dashed border-waiting px-4 py-2 text-waiting-ink"
              }
            >
              {sealed ? <SealCheck aria-hidden weight="fill" className="size-6" /> : <Warning aria-hidden weight="fill" className="size-6" />}
              <span className="text-sm font-bold tracking-[0.12em] uppercase">{sealed ? "Sealed" : "Provisional"}</span>
            </div>
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Summary label="Result">
              <StatusPill kind="job" status={receipt.result} />
            </Summary>
            <Summary label="Requirements">
              {receipt.requirements.verified}/{receipt.requirements.total} verified
            </Summary>
            <Summary label="Human decisions">{receipt.decisions.length}</Summary>
            <Summary label="Final amount">{money(receipt.final_amount)}</Summary>
          </dl>

          {!sealed && (
            <p className="mt-6 rounded-control bg-waiting-soft px-4 py-3 text-caption text-waiting-ink">
              This job is not closed, so this receipt is a provisional snapshot. It is sealed once, at close, and never
              regenerated after that.
            </p>
          )}
        </header>

        <div className="divide-y divide-line">
          <Section title="Requirements" note="Each one names the claims that satisfied it.">
            <ul className="space-y-2.5">
              {receipt.requirements.detail.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-sm text-ink">{r.description}</span>
                  <span className="flex items-center gap-2">
                    {r.supported_by.length > 0 && (
                      <span className="font-mono text-[0.6875rem] text-muted">{r.supported_by.join(", ")}</span>
                    )}
                    <StatusPill kind="requirement" status={r.status} />
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Claims" note="What the evidence says happened, and which artifacts say it.">
            <ul className="grid gap-2 sm:grid-cols-2">
              {receipt.claims.map((c) => (
                <li key={c.id} className="rounded-control border border-line px-3 py-2">
                  <p className="text-caption font-semibold text-ink">
                    {CLAIM_TYPE[c.type] ?? c.type}
                    {c.quantity != null && ` × ${c.quantity}`}
                    <span className="ml-2 font-mono text-[0.6875rem] font-normal text-muted">{percent(c.confidence)}</span>
                  </p>
                  <p className="mt-0.5 font-mono text-[0.6875rem] text-muted">
                    {c.id} ← {c.evidence.join(", ") || "no artifact"}
                  </p>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Evidence" note="Content hashes of every artifact the decision rests on.">
            <ul className="space-y-1.5">
              {receipt.evidence.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-4 font-mono text-micro">
                  <span className="text-ink">
                    {e.id} <span className="font-sans text-muted">{EVIDENCE_TYPE[e.type]?.short ?? e.type}</span>
                  </span>
                  <span className="text-muted" title={e.sha256}>
                    {shortHash(e.sha256, 24)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Conflicts and how they were resolved">
            {receipt.conflicts.length === 0 ? (
              <p className="text-caption text-muted">None. Every claim matched the work order.</p>
            ) : (
              <ul className="space-y-2">
                {receipt.conflicts.map((c) => {
                  const resolution = RESOLUTION[c.resolution] ?? { label: c.resolution, tone: "neutral" as const };
                  return (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-ink">{CONFLICT_TYPE[c.type] ?? c.type}</span>
                      <Badge tone={resolution.tone}>{resolution.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section title="Human decisions">
            {receipt.decisions.length === 0 ? (
              <p className="text-caption text-muted">None. This job closed without anyone being asked.</p>
            ) : (
              <ul className="space-y-3">
                {receipt.decisions.map((d) => (
                  <li key={d.id}>
                    <p className="text-sm text-ink">{d.question}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-micro text-muted">
                      {d.decision ? (
                        <Badge tone={DECISION_ACTION[d.decision].tone}>{DECISION_ACTION[d.decision].label}</Badge>
                      ) : (
                        <Badge tone="neutral">No answer</Badge>
                      )}
                      {d.decided_by && <span>by {d.decided_by}</span>}
                      <span>· {d.policy}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Actions taken">
            <ol className="flex flex-wrap gap-2">
              {receipt.actions.map((a, i) => (
                <li key={`${a}-${i}`} className="rounded-full bg-sunken px-2.5 py-1 text-micro font-medium text-ink-2">
                  {actionLabel(a)}
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <footer className="border-t border-line bg-sunken/50 px-6 py-6 sm:px-10">
          <p className="text-caption font-semibold text-ink">SHA-256 of the canonical receipt</p>
          <p className="mt-0.5 text-micro text-muted">Any later edit to anything above changes this value.</p>
          <div className="mt-3 flex items-center gap-2 rounded-control border border-line bg-surface px-3 py-2">
            <code className="min-w-0 flex-1 font-mono text-micro break-all text-ink">{receipt.sha256}</code>
            <CopyButton value={receipt.sha256} label="Copy receipt hash" />
          </div>
          <div className="mt-4">
            <VerifyReceipt jobId={receipt.job_id} />
          </div>
        </footer>
      </article>
    </div>
  );
}

function Summary({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-micro text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-ink tabular">{children}</dd>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 px-6 py-6 sm:grid-cols-[13rem_minmax(0,1fr)] sm:px-10">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {note && <p className="mt-1 text-micro text-muted">{note}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
