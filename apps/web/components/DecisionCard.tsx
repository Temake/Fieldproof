"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DecisionDetail } from "@/lib/types";
import { api, money } from "@/lib/api";
import { StatusPill } from "./StatusPill";

/**
 * PRD 14 Screen 3 - the hero UI.
 *
 * A supervisor should be able to answer without opening anything else, so the
 * card carries the whole case: the issue, the money, the evidence behind it,
 * and the policy that made this a question in the first place.
 */
export function DecisionCard({ detail }: { detail: DecisionDetail }) {
  const { decision, conflict, job, evidence } = detail;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const resolved = decision.status === "RESOLVED";

  function act(action: string) {
    setError(null);
    startTransition(async () => {
      try {
        await api.resolve(decision.id, action, "Sarah");
        router.push(`/jobs/${job.id}`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "could not submit");
      }
    });
  }

  return (
    <section className="rounded-xl border border-[var(--color-line)] bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-blocking)]">
          Decision required
        </p>
        <span className="text-sm text-[var(--color-muted)]">Job {job.id}</span>
      </div>

      <h1 className="mt-3 text-xl font-semibold">{decision.question}</h1>

      <dl className="mt-5 grid gap-4 sm:grid-cols-3">
        <Field label="Original authorization" value={String(conflict?.expected_value ?? "-")} />
        <Field label="Verified" value={String(conflict?.observed_value ?? "-")} />
        <Field label="Additional amount" value={money(decision.financial_impact)} />
      </dl>

      <div className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Supporting evidence
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          {evidence.map((e) => (
            <li key={e.id} className="flex items-center gap-2">
              <span className="text-[var(--color-verified)]">✓</span>
              <span>{e.filename ?? e.type}</span>
              <span className="text-xs text-[var(--color-muted)]">
                {e.type}
                {e.observations[0] &&
                  ` · ${Math.round(e.observations[0].confidence * 100)}% confident`}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-5 rounded-lg bg-slate-50 p-3 text-sm text-[var(--color-muted)]">
        <span className="font-medium text-[var(--color-ink)]">Policy: </span>
        {decision.policy}
      </p>

      <p className="mt-3 text-sm">
        Recommended action:{" "}
        <span className="font-semibold">{decision.recommended_action}</span>
      </p>

      {resolved ? (
        <p className="mt-5 text-sm">
          <StatusPill status={decision.decision ?? "RESOLVED"} /> by {decision.decided_by}
        </p>
      ) : (
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => act("APPROVE")}
            disabled={pending}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={() => act("REQUEST_CLARIFICATION")}
            disabled={pending}
            className="rounded-lg border border-[var(--color-line)] px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            Request clarification
          </button>
          <button
            onClick={() => act("REJECT")}
            disabled={pending}
            className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-[var(--color-muted)]">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{value}</dd>
    </div>
  );
}
