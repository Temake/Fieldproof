import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/lib/cx";
import { percent } from "@/lib/format";
import type { JobState } from "@/lib/types";
import { CLAIM_TYPE, EVIDENCE_TYPE } from "@/lib/vocabulary";
import { StatusPill } from "./StatusPill";
import { EVIDENCE_ICON } from "./job/evidence-icon";

/**
 * PRD 14 Screen 4 - requirement -> claim -> evidence.
 *
 * Rendered as left-to-right chains rather than a force-directed graph on
 * purpose: the question a reviewer is asking is "what backs this
 * requirement", and a chain answers it faster than a cloud of nodes.
 */
export function EvidenceGraph({ state }: { state: Pick<JobState, "requirements" | "claims" | "links" | "evidence"> }) {
  const evidenceById = new Map(state.evidence.map((e) => [e.id, e]));
  const claimById = new Map(state.claims.map((c) => [c.id, c]));

  if (state.requirements.length === 0) {
    return <p className="text-caption text-muted">No requirements to trace.</p>;
  }

  return (
    <div className="space-y-3">
      <div aria-hidden className="hidden grid-cols-[minmax(0,1.1fr)_1.25rem_minmax(0,1fr)_1.25rem_minmax(0,1.2fr)] gap-3 px-4 text-label text-muted lg:grid">
        <span>Requirement</span>
        <span />
        <span>Claim</span>
        <span />
        <span>Evidence</span>
      </div>
      {state.requirements.map((requirement) => {
        const claims = requirement.supporting_claim_ids
          .map((id) => claimById.get(id))
          .filter((c) => c !== undefined);

        return (
          <div
            key={requirement.id}
            className="grid gap-3 rounded-panel border border-line bg-surface p-4 lg:grid-cols-[minmax(0,1.1fr)_1.25rem_minmax(0,2.45fr)] lg:items-start"
          >
            <div className="flex items-start justify-between gap-3 lg:flex-col lg:justify-start">
              <p className="text-sm font-semibold text-ink">{requirement.description}</p>
              <StatusPill kind="requirement" status={requirement.status} />
            </div>

            <ArrowRight aria-hidden className="mt-1 hidden size-4 text-faint lg:block" />

            {claims.length === 0 ? (
              <p className="self-center text-caption text-muted">Nothing supports this yet.</p>
            ) : (
              <ul className="space-y-2">
                {claims.map((claim) => {
                  const links = state.links.filter((l) => l.claim_id === claim.id);
                  return (
                    <li
                      key={claim.id}
                      className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_1.25rem_minmax(0,1.2fr)] lg:items-start"
                    >
                      <div className="rounded-control border border-accent-line bg-accent-soft/60 px-3 py-2">
                        <p className="text-caption font-semibold text-ink">
                          {CLAIM_TYPE[claim.type] ?? claim.type}
                          {claim.quantity != null && <span className="text-ink-2"> × {claim.quantity}</span>}
                        </p>
                        <p className="font-mono text-[0.6875rem] text-muted">
                          {percent(claim.confidence)} confident
                          {claim.part_number && ` · ${claim.part_number}`}
                        </p>
                      </div>
                      <ArrowRight aria-hidden className="mt-2.5 hidden size-4 text-faint lg:block" />
                      <ul className="space-y-1.5">
                        {links.map((link) => {
                          const evidence = evidenceById.get(link.evidence_id);
                          const Icon = evidence ? EVIDENCE_ICON[evidence.type] : ArrowRight;
                          const proves = link.relationship === "SUPPORTS";
                          return (
                            <li
                              key={`${link.claim_id}-${link.evidence_id}`}
                              className={cx(
                                "flex items-start gap-2 rounded-control border px-3 py-2",
                                proves ? "border-verified-line bg-verified-soft/50" : "border-line bg-sunken",
                              )}
                            >
                              <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-2" />
                              <div className="min-w-0">
                                <p className="truncate text-caption font-medium text-ink">
                                  {evidence?.filename ?? link.evidence_id}
                                </p>
                                <p className="text-[0.6875rem] text-muted">
                                  <span className={proves ? "font-semibold text-verified-ink" : "font-semibold"}>
                                    {proves ? "Proves" : link.relationship === "CONTRADICTS" ? "Contradicts" : "Corroborates"}
                                  </span>
                                  {evidence && ` · ${EVIDENCE_TYPE[evidence.type]?.short ?? evidence.type}`}
                                  {link.rationale && ` · ${link.rationale}`}
                                </p>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
