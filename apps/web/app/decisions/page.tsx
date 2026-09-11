import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle, Gavel } from "@phosphor-icons/react/dist/ssr";
import { ApiUnavailable } from "@/components/ApiUnavailable";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { SegmentedLinks } from "@/components/ui/tabs";
import { load, serverApi } from "@/lib/api/server";
import { dateTime, relative, signedMoney } from "@/lib/format";
import type { DecisionStatus } from "@/lib/types";
import { DECISION_ACTION } from "@/lib/vocabulary";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Decisions" };

const VIEWS: { key: string; label: string; status: DecisionStatus }[] = [
  { key: "pending", label: "Pending", status: "PENDING" },
  { key: "resolved", label: "Resolved", status: "RESOLVED" },
  { key: "withdrawn", label: "Withdrawn", status: "EXPIRED" },
];

/** The supervisor queue: only questions policy says a person must answer. */
export default async function DecisionsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view: viewKey } = await searchParams;
  const view = VIEWS.find((v) => v.key === viewKey) ?? VIEWS[0];
  const result = await load(serverApi.decisions(view.status));

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-title text-ink">Decisions</h1>
          <p className="mt-2 max-w-[60ch] text-body text-muted">
            FieldProof escalates only what policy says a person must decide. Everything else it resolves or recovers on
            its own.
          </p>
        </div>
        <SegmentedLinks
          label="Decision status"
          layoutId="decision-view"
          items={VIEWS.map((v) => ({ href: v.key === "pending" ? "/decisions" : `/decisions?view=${v.key}`, label: v.label, active: v === view }))}
        />
      </header>

      {!result.ok ? (
        <ApiUnavailable error={result.error} what="the decision queue" />
      ) : result.data.length === 0 ? (
        <div className="rounded-panel border border-dashed border-line-strong bg-surface">
          <EmptyState
            icon={view.status === "PENDING" ? <CheckCircle className="size-6" /> : <Gavel className="size-6" />}
            title={view.status === "PENDING" ? "Nothing needs a decision" : `No ${view.label.toLowerCase()} decisions`}
          >
            {view.status === "PENDING"
              ? "When evidence and the work order disagree in a way policy cannot settle, the question lands here."
              : "They will appear here as supervisors answer, or as new evidence withdraws a question."}
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-3">
          {[...result.data]
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map((d) => (
              <li key={d.id}>
                <Link
                  href={`/decisions/${d.id}`}
                  className="group grid gap-3 rounded-panel border border-line bg-surface p-5 shadow-raised transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink sm:text-[0.9375rem]">{d.question}</p>
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-muted">
                      <span className="font-mono font-semibold text-ink-2">{d.job_id}</span>
                      {d.policy_id && <span className="font-mono">{d.policy_id}</span>}
                      <span title={dateTime(d.created_at)}>asked {relative(d.created_at)}</span>
                      {d.status === "RESOLVED" && d.decision && (
                        <span>
                          by <span className="font-semibold text-ink-2">{d.decided_by}</span>
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {d.financial_impact !== 0 && (
                      <span className="text-sm font-bold text-ink tabular">{signedMoney(d.financial_impact)}</span>
                    )}
                    {d.status === "PENDING" ? (
                      <Badge tone="blocking" live>
                        Pending
                      </Badge>
                    ) : d.status === "EXPIRED" ? (
                      <Badge tone="neutral">Withdrawn</Badge>
                    ) : d.decision ? (
                      <Badge tone={DECISION_ACTION[d.decision].tone}>{DECISION_ACTION[d.decision].label}</Badge>
                    ) : null}
                    <ArrowRight aria-hidden className="size-4 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
                  </div>
                </Link>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
