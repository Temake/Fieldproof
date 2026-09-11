import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/lib/cx";
import { signedMoney } from "@/lib/format";
import type { Conflict, Decision } from "@/lib/types";
import { CONFLICT_TYPE } from "@/lib/vocabulary";
import { StatusPill } from "../StatusPill";

const ORDER: Record<string, number> = {
  OPEN: 0,
  AWAITING_CLARIFICATION: 1,
  HUMAN_REJECTED: 2,
  HUMAN_APPROVED: 3,
  AUTO_RESOLVED: 4,
  CLEARED: 5,
};

/**
 * Every discrepancy reconciliation found, including the ones that later
 * disappeared - the history is part of the audit trail.
 */
export function Conflicts({ conflicts, decisions }: { conflicts: Conflict[]; decisions: Decision[] }) {
  if (conflicts.length === 0) {
    return <p className="text-caption text-muted">No conflicts. Every claim matched the work order.</p>;
  }
  const sorted = [...conflicts].sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));

  return (
    <ul className="space-y-3">
      {sorted.map((c) => {
        const decision =
          decisions.find((d) => d.id === c.resolution_decision_id) ??
          decisions.find((d) => d.conflict_id === c.id && d.status === "PENDING");
        const settled = c.status === "CLEARED" || c.status === "AUTO_RESOLVED";
        return (
          <li
            key={c.id}
            className={cx(
              "rounded-control border p-3",
              c.status === "OPEN" ? "border-blocking-line bg-blocking-soft/40" : "border-line",
              settled && "opacity-80",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">{CONFLICT_TYPE[c.type] ?? c.type}</p>
              <StatusPill kind="conflict" status={c.status} />
            </div>
            <p className="mt-1 text-caption text-ink-2">{c.description}</p>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-muted">
              {(c.status === "OPEN" || c.status === "AWAITING_CLARIFICATION") && (
                <StatusPill kind="severity" status={c.severity} />
              )}
              {c.financial_impact !== 0 && <span className="font-semibold text-ink-2">{signedMoney(c.financial_impact)}</span>}
              {c.policy_id && <span className="font-mono">{c.policy_id}</span>}
              {decision && (
                <Link
                  href={`/decisions/${decision.id}`}
                  className="inline-flex items-center gap-1 font-semibold text-accent-ink hover:underline"
                >
                  {decision.status === "PENDING" ? "Decide" : "Decision"}
                  <ArrowRight aria-hidden className="size-3" />
                </Link>
              )}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
