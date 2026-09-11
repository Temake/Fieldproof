"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CaretRight,
  ChatText,
  Check,
  Gavel,
  ShieldCheck,
  Sparkle,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { clientApi } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { cx } from "@/lib/cx";
import { dateTime, money, percent, relative, signedMoney } from "@/lib/format";
import type { DecisionAction, DecisionDetail } from "@/lib/types";
import { CLAIM_TYPE, CONFLICT_TYPE, DECISION_ACTION } from "@/lib/vocabulary";
import { StatusPill } from "./StatusPill";
import { EvidenceList } from "./job/EvidenceList";
import { Alert } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Field, Input, Textarea } from "./ui/field";
import { Panel } from "./ui/panel";
import { useToast } from "./ui/toast";

const NAME_KEY = "fieldproof.supervisor-name";

/**
 * PRD 14 Screen 3 - the hero UI.
 *
 * A supervisor should be able to answer without opening anything else, so the
 * card carries the whole case: the issue, the money, the evidence behind it,
 * and the policy that made this a question in the first place.
 */
export function DecisionCard({ detail }: { detail: DecisionDetail }) {
  const { decision, conflict, job, evidence, claims } = detail;
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState<DecisionAction | null>(null);
  const [errors, setErrors] = useState<{ name?: string; comment?: string; form?: string }>({});
  const [confirmReject, setConfirmReject] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(NAME_KEY);
      if (saved) setName(saved);
    } catch {
      // Storage unavailable; the field simply starts empty.
    }
  }, []);

  const pending = decision.status === "PENDING";
  const impact = decision.financial_impact;
  const technician = job.technician_name ?? job.technician_id;
  const expected = conflict?.expected_value;
  const observed = conflict?.observed_value;
  const numericComparison = typeof expected === "number" && typeof observed === "number";
  const isMoney = conflict?.type === "spending_limit_violation" || conflict?.type === "price_mismatch";

  function validate(action: DecisionAction) {
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Enter your name. It is recorded on the receipt.";
    if (action === "REQUEST_CLARIFICATION" && !comment.trim()) {
      next.comment = `Tell ${technician} what you need. This text is sent to them.`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(action: DecisionAction) {
    if (!validate(action)) return;
    setSubmitting(action);
    setConfirmReject(false);
    try {
      try {
        window.localStorage.setItem(NAME_KEY, name.trim());
      } catch {
        // Not critical.
      }
      const result = await clientApi.resolveDecision(decision.id, {
        decision: action,
        decided_by: name.trim(),
        comment: comment.trim() || null,
      });
      toast.push({
        tone: "success",
        title: result.duplicate ? "This decision was already recorded" : `${DECISION_ACTION[action].label}`,
        description:
          action === "REQUEST_CLARIFICATION"
            ? `FieldProof is relaying your question to ${technician}.`
            : "FieldProof resumed the workflow. Watch it finish on the timeline.",
      });
      router.push(`/jobs/${job.id}`);
      router.refresh();
    } catch (error) {
      setErrors({ form: errorMessage(error) });
      setSubmitting(null);
    }
  }

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-caption text-muted">
        <Link href="/decisions" className="hover:text-ink hover:underline">
          Decisions
        </Link>
        <CaretRight aria-hidden className="size-3" />
        <span aria-current="page" className="font-mono text-ink-2">
          {decision.id}
        </span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel as="article" padded={false} className="overflow-hidden" aria-labelledby="decision-question">
          <div className={cx("border-b px-5 py-4 sm:px-7", pending ? "border-blocking-line bg-blocking-soft/70" : "border-line bg-sunken/60")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                <Gavel aria-hidden weight="fill" className={cx("size-5", pending ? "text-blocking" : "text-muted")} />
                {pending ? "Decision required" : decision.status === "EXPIRED" ? "Decision withdrawn" : "Decision recorded"}
              </span>
              <span className="text-micro text-muted">
                <Link href={`/jobs/${job.id}`} className="font-mono font-semibold text-accent-ink hover:underline">
                  {job.id}
                </Link>{" "}
                · asked {relative(decision.created_at)}
              </span>
            </div>
          </div>

          <div className="space-y-7 px-5 py-6 sm:px-7 sm:py-7">
            <h1 id="decision-question" className="max-w-[40ch] text-heading text-balance text-ink">
              {decision.question}
            </h1>

            {numericComparison && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label={isMoney ? "Allowed" : "Authorized"} value={isMoney ? money(expected as number) : String(expected)} />
                <Stat
                  label={isMoney ? "Observed" : "Verified"}
                  value={isMoney ? money(observed as number) : String(observed)}
                  emphasis
                />
                <Stat
                  label={impact !== 0 ? "Additional amount" : "Difference"}
                  value={impact !== 0 ? signedMoney(impact) : String((observed as number) - (expected as number))}
                  sub={impact !== 0 ? `${money(job.authorized_amount + impact)} total if approved` : undefined}
                />
              </div>
            )}
            {!numericComparison && impact !== 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Stat label="Additional amount" value={signedMoney(impact)} emphasis />
                <Stat label="Total if approved" value={money(job.authorized_amount + impact)} />
              </div>
            )}

            <div className="flex gap-3 rounded-control border border-line bg-sunken/60 p-4">
              <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-accent" />
              <div>
                <p className="text-sm font-semibold text-ink">
                  Why this is a question
                  {decision.policy_id && <span className="ml-2 font-mono text-micro font-semibold text-muted">{decision.policy_id}</span>}
                </p>
                <p className="mt-0.5 text-caption text-ink-2">{decision.policy}</p>
                {conflict && (
                  <p className="mt-2 text-micro text-muted">
                    {CONFLICT_TYPE[conflict.type] ?? conflict.type}: {conflict.description}
                  </p>
                )}
              </div>
            </div>

            <section aria-labelledby="evidence-heading">
              <h2 id="evidence-heading" className="mb-3 text-sm font-semibold text-ink">
                Evidence behind it
              </h2>
              {evidence.length === 0 ? (
                <p className="text-caption text-muted">No artifacts were attached to this decision.</p>
              ) : (
                <EvidenceList evidence={evidence} job={job} compact />
              )}
              {claims.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {claims.map((c) => (
                    <li key={c.id}>
                      <Badge tone="agent">
                        {CLAIM_TYPE[c.type] ?? c.type}
                        {c.quantity != null && ` × ${c.quantity}`} · {percent(c.confidence)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {pending ? (
              <form
                className="space-y-5 border-t border-line pt-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit("APPROVE");
                }}
                noValidate
              >
                <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
                  <Field id="decided-by" label="Deciding as" error={errors.name} hint="Recorded on the receipt.">
                    {(control) => (
                      <Input
                        {...control}
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                      />
                    )}
                  </Field>
                  <Field
                    id="comment"
                    label="Comment"
                    optional
                    error={errors.comment}
                    hint={`Required to request clarification: it is sent to ${technician}.`}
                  >
                    {(control) => (
                      <Textarea
                        {...control}
                        rows={2}
                        className="min-h-10"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                      />
                    )}
                  </Field>
                </div>

                {errors.form && (
                  <Alert tone="danger" title="Your decision was not recorded">
                    {errors.form}
                  </Alert>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="submit"
                    variant="approve"
                    size="lg"
                    loading={submitting === "APPROVE"}
                    disabled={submitting !== null}
                    icon={<Check weight="bold" className="size-4" />}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    loading={submitting === "REQUEST_CLARIFICATION"}
                    disabled={submitting !== null}
                    onClick={() => void submit("REQUEST_CLARIFICATION")}
                    icon={<ChatText className="size-4" />}
                  >
                    Request clarification
                  </Button>
                  <Button
                    variant="danger"
                    size="lg"
                    loading={submitting === "REJECT"}
                    disabled={submitting !== null}
                    onClick={() => validate("REJECT") && setConfirmReject(true)}
                    icon={<X weight="bold" className="size-4" />}
                  >
                    Reject
                  </Button>
                  <span className="flex items-center gap-1.5 text-micro text-muted">
                    <Sparkle aria-hidden weight="fill" className="size-3.5 text-accent" />
                    FieldProof recommends{" "}
                    <span className="font-semibold text-ink-2">{DECISION_ACTION[decision.recommended_action].verb.toLowerCase()}</span>
                  </span>
                </div>
              </form>
            ) : (
              <Outcome detail={detail} />
            )}
          </div>
        </Panel>

        <aside className="space-y-6">
          <Panel>
            <h2 className="text-sm font-semibold text-ink">What each answer does</h2>
            <dl className="mt-4 space-y-4 text-caption">
              <div>
                <dt className="font-semibold text-verified-ink">Approve</dt>
                <dd className="mt-0.5 text-ink-2">
                  The work is accepted{impact > 0 && <> and {money(impact)} is added to the invoice</>}. FieldProof resumes
                  and finishes the closeout.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-waiting-ink">Request clarification</dt>
                <dd className="mt-0.5 text-ink-2">
                  Your comment goes to {technician}. The job stays blocked; their reply comes back to you as a new decision.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-blocking-ink">Reject</dt>
                <dd className="mt-0.5 text-ink-2">
                  The work is not approved{impact > 0 && <> and {money(impact)} is not billed</>}. FieldProof records it on the
                  receipt and continues.
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel>
            <h2 className="text-sm font-semibold text-ink">The job</h2>
            <p className="mt-2 text-caption text-ink-2">{job.description}</p>
            <dl className="mt-4 space-y-2 text-caption">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Status</dt>
                <dd>
                  <StatusPill kind="job" status={job.status} />
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Technician</dt>
                <dd className="font-semibold text-ink">{technician}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Authorized</dt>
                <dd className="font-semibold text-ink tabular">{money(job.authorized_amount)}</dd>
              </div>
            </dl>
            <Link
              href={`/jobs/${job.id}`}
              className="mt-4 inline-flex items-center gap-1 text-caption font-semibold text-accent-ink hover:underline"
            >
              Open the job timeline <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          </Panel>
        </aside>
      </div>

      <Dialog
        open={confirmReject}
        onClose={() => setConfirmReject(false)}
        title="Reject this work?"
        description={
          impact > 0
            ? `${money(impact)} will not be billed. FieldProof records the rejection on the receipt and continues the closeout.`
            : "FieldProof records the rejection on the receipt and continues the closeout."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmReject(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void submit("REJECT")} icon={<X weight="bold" className="size-4" />}>
              Reject
            </Button>
          </>
        }
      />
    </div>
  );
}

function Stat({ label, value, sub, emphasis }: { label: string; value: string; sub?: string; emphasis?: boolean }) {
  return (
    <div className={cx("rounded-control border p-4", emphasis ? "border-blocking-line bg-blocking-soft/50" : "border-line")}>
      <p className="text-micro font-medium text-muted">{label}</p>
      <p className="mt-1 text-[1.75rem] leading-none font-bold tracking-[-0.02em] text-ink tabular [font-stretch:90%]">{value}</p>
      {sub && <p className="mt-1.5 text-micro text-muted">{sub}</p>}
    </div>
  );
}

function Outcome({ detail }: { detail: DecisionDetail }) {
  const { decision } = detail;
  if (decision.status === "EXPIRED") {
    return (
      <Alert tone="info" title="Withdrawn: new evidence cleared this conflict">
        Nobody needed to answer. FieldProof withdrew the question when reconciliation stopped detecting it.
      </Alert>
    );
  }
  const action = decision.decision ? DECISION_ACTION[decision.decision] : null;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 rounded-control border border-line bg-sunken/60 p-4 sm:flex-row sm:items-center"
      >
        {action && <Badge tone={action.tone} size="md">{action.label}</Badge>}
        <p className="text-caption text-ink-2">
          by <span className="font-semibold text-ink">{decision.decided_by ?? "unknown"}</span>
          {decision.resolved_at && <> on {dateTime(decision.resolved_at)}</>}
          {decision.comment && <> &middot; &ldquo;{decision.comment}&rdquo;</>}
        </p>
      </motion.div>
    </AnimatePresence>
  );
}
