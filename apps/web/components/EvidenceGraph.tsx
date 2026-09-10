import type { JobState } from "@/lib/types";
import { StatusPill } from "./StatusPill";

/**
 * PRD 14 Screen 4 - requirement -> claim -> evidence.
 *
 * Rendered as columns rather than a force-directed graph on purpose: the
 * question a reviewer is asking is "what backs this requirement", and a
 * left-to-right chain answers it faster than a cloud of nodes.
 */
export function EvidenceGraph({ state }: { state: JobState }) {
  const evidenceById = new Map(state.evidence.map((e) => [e.id, e]));
  const claimById = new Map(state.claims.map((c) => [c.id, c]));

  return (
    <div className="space-y-4">
      {state.requirements.map((requirement) => {
        const claims = requirement.supporting_claim_ids
          .map((id) => claimById.get(id))
          .filter((c) => c !== undefined);
        return (
          <div
            key={requirement.id}
            className="rounded-lg border border-[var(--color-line)] bg-white p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">{requirement.description}</p>
              <StatusPill status={requirement.status} />
            </div>

            {claims.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                Nothing supports this yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {claims.map((claim) => {
                  const links = state.links.filter((l) => l.claim_id === claim.id);
                  return (
                    <li key={claim.id} className="text-sm">
                      <span className="font-medium">{claim.type.replaceAll("_", " ")}</span>
                      {claim.quantity != null && <span> × {claim.quantity}</span>}
                      <span className="ml-2 text-xs text-[var(--color-muted)]">
                        {Math.round(claim.confidence * 100)}% confident
                      </span>
                      <ul className="mt-1 ml-4 space-y-0.5">
                        {links.map((link) => {
                          const evidence = evidenceById.get(link.evidence_id);
                          return (
                            <li
                              key={`${link.claim_id}-${link.evidence_id}`}
                              className="text-xs text-[var(--color-muted)]"
                            >
                              {link.relationship === "SUPPORTS" ? "└─ proves" : "└─ corroborates"}
                              {" · "}
                              {evidence?.filename ?? link.evidence_id} ({evidence?.type})
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
