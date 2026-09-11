"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  ArrowsClockwise,
  CaretRight,
  DeviceMobile,
  Gavel,
  HandPalm,
  Hourglass,
  Receipt,
  SealCheck,
} from "@phosphor-icons/react/dist/ssr";
import { clientApi } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { cx } from "@/lib/cx";
import { dateTime, money, percent, signedMoney } from "@/lib/format";
import type { JobEvent, JobState, Metrics } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";
import { ACTIVE_STATUSES, JOB_STATUS } from "@/lib/vocabulary";
import { EvidenceGraph } from "./EvidenceGraph";
import { LiveIndicator } from "./LiveIndicator";
import { StatusPill } from "./StatusPill";
import { Timeline, currentNode } from "./Timeline";
import { WorkflowTracker } from "./WorkflowTracker";
import { Conflicts } from "./job/Conflicts";
import { EvidenceList } from "./job/EvidenceList";
import { Requirements } from "./job/Requirements";
import { RunsAndMessages } from "./job/RunsAndMessages";
import { Button, ButtonLink } from "./ui/button";
import { EmptyState } from "./ui/feedback";
import { Checkbox } from "./ui/field";
import { Facts, Panel, PanelHeader } from "./ui/panel";
import { TabPanel, Tabs } from "./ui/tabs";
import { useToast } from "./ui/toast";

interface JobData {
  state: JobState;
  metrics: Metrics;
}

type Tab = "activity" | "evidence" | "runs";

function lastEventAge(events: JobEvent[]): number {
  const last = events.reduce((max, e) => (e.created_at > max ? e.created_at : max), "");
  return last ? Date.now() - new Date(last).getTime() : Infinity;
}

/** Poll fast while FieldProof works, slowly while it waits on people, not at all once settled. */
function intervalFor({ state }: JobData): number | null {
  const status = state.job.status;
  if (ACTIVE_STATUSES.has(status)) return 1000;
  if (status === "CLOSED") return lastEventAge(state.events) < 15000 ? 1500 : null;
  return 4000;
}

export function JobLive({ initial }: { initial: JobData }) {
  const jobId = initial.state.job.id;
  const poll = usePoll(
    async () => {
      const [state, metrics] = await Promise.all([clientApi.job(jobId), clientApi.metrics(jobId)]);
      return { state, metrics };
    },
    initial,
    { interval: intervalFor },
  );
  const { state, metrics } = poll.data;
  const { job } = state;
  const [tab, setTab] = useState<Tab>("activity");
  const [showSystem, setShowSystem] = useState(false);
  const working = currentNode(state.events);
  const active = ACTIVE_STATUSES.has(job.status) || working !== null;
  const activeEvidence = state.evidence.filter((e) => !e.superseded_by);

  return (
    <div className="space-y-8">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-caption text-muted">
        <Link href="/dashboard" className="hover:text-ink hover:underline">
          Operations
        </Link>
        <CaretRight aria-hidden className="size-3" />
        <span aria-current="page" className="font-mono text-ink-2">
          {job.id}
        </span>
      </nav>

      <header className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <p className="font-mono text-caption font-semibold text-accent-ink">{job.id}</p>
          <h1 className="mt-1 text-title text-ink">{job.description || "Untitled work order"}</h1>
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-caption text-muted">
            <span>
              Technician <span className="font-semibold text-ink-2">{job.technician_name ?? job.technician_id}</span>
            </span>
            {job.site_address && (
              <span>
                Site <span className="font-semibold text-ink-2">{job.site_address}</span>
              </span>
            )}
            <span>
              Customer <span className="font-mono font-semibold text-ink-2">{job.customer_id}</span>
            </span>
          </p>
        </div>
        <div className="flex flex-col gap-3 lg:items-end">
          <div className="flex items-center gap-3">
            <LiveIndicator updatedAt={poll.updatedAt} error={poll.error} live={job.status !== "CLOSED"} />
            <StatusPill kind="job" status={job.status} size="md" />
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/field/${job.id}`} variant="secondary" size="sm" icon={<DeviceMobile className="size-4" />}>
              Technician view
            </ButtonLink>
            <ButtonLink href={`/jobs/${job.id}/receipt`} variant="secondary" size="sm" icon={<Receipt className="size-4" />}>
              {job.status === "CLOSED" ? "Receipt" : "Provisional receipt"}
            </ButtonLink>
          </div>
        </div>
      </header>

      <StatusBanner state={state} onRetried={poll.refresh} />

      <Panel aria-label="Workflow progress">
        <WorkflowTracker events={state.events} />
      </Panel>

      <div>
        <Tabs
          label="Job sections"
          idPrefix="job"
          value={tab}
          onChange={setTab}
          items={[
            { key: "activity", label: "Activity" },
            { key: "evidence", label: "Evidence", count: activeEvidence.length },
            { key: "runs", label: "Runs and messages" },
          ]}
        />
        <div className="pt-6">
          <TabPanel tab="activity" value={tab} idPrefix="job">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              <Panel aria-labelledby="timeline-heading">
                <PanelHeader
                  id="timeline-heading"
                  title="Timeline"
                  description="Everything FieldProof and the people on this job did, in order."
                  actions={
                    <Checkbox
                      label="Show agent steps"
                      checked={showSystem}
                      onChange={(e) => setShowSystem(e.target.checked)}
                      className="text-caption"
                    />
                  }
                />
                <Timeline events={state.events} job={job} showSystem={showSystem} workingOn={active ? working : null} />
              </Panel>

              <div className="space-y-6">
                <Panel aria-labelledby="numbers-heading">
                  <PanelHeader id="numbers-heading" title="This job" />
                  <Facts
                    items={[
                      { label: "Workflow steps", value: metrics.workflow_steps },
                      { label: "Handled autonomously", value: metrics.handled_autonomously },
                      { label: "Technician interactions", value: metrics.technician_interactions },
                      { label: "Supervisor decisions", value: metrics.supervisor_decisions },
                      { label: "Manual document reviews", value: metrics.manual_document_reviews },
                      {
                        label: "Automation rate",
                        value: metrics.workflow_steps ? percent(metrics.automation_rate, 1) : "-",
                      },
                    ]}
                  />
                  <div className="mt-4 border-t border-line pt-4">
                    <Facts
                      items={[
                        { label: "Authorized", value: money(job.authorized_amount) },
                        { label: "Extra allowed without approval", value: money(job.max_additional_spend_without_approval) },
                        { label: "Final amount", value: job.final_amount != null ? money(job.final_amount) : "Not invoiced yet" },
                      ]}
                    />
                  </div>
                </Panel>

                <Panel aria-labelledby="requirements-heading">
                  <PanelHeader id="requirements-heading" title="Requirements" />
                  <Requirements requirements={state.requirements} />
                </Panel>

                <Panel aria-labelledby="conflicts-heading">
                  <PanelHeader id="conflicts-heading" title="Conflicts" />
                  <Conflicts conflicts={state.conflicts} decisions={state.decisions} />
                </Panel>
              </div>
            </div>
          </TabPanel>

          <TabPanel tab="evidence" value={tab} idPrefix="job">
            <div className="space-y-6">
              <Panel aria-labelledby="graph-heading">
                <PanelHeader
                  id="graph-heading"
                  title="What backs each requirement"
                  description="A claim needs compatible evidence: a receipt proves a purchase, never an installation."
                />
                <EvidenceGraph state={state} />
              </Panel>
              <section aria-labelledby="artifacts-heading">
                <h2 id="artifacts-heading" className="mb-3 text-subheading text-ink">
                  Artifacts
                </h2>
                {state.evidence.length === 0 ? (
                  <Panel>
                    <EmptyState icon={<DeviceMobile className="size-6" />} title="No evidence uploaded yet">
                      The technician uploads photos, receipts, signatures and voice notes from the{" "}
                      <Link href={`/field/${job.id}`} className="font-semibold text-accent-ink hover:underline">
                        technician view
                      </Link>
                      .
                    </EmptyState>
                  </Panel>
                ) : (
                  <EvidenceList evidence={state.evidence} job={job} />
                )}
              </section>
            </div>
          </TabPanel>

          <TabPanel tab="runs" value={tab} idPrefix="job">
            <RunsAndMessages job={job} active={active} />
          </TabPanel>
        </div>
      </div>
    </div>
  );
}

function StatusBanner({ state, onRetried }: { state: JobState; onRetried: () => Promise<void> }) {
  const { job } = state;
  const toast = useToast();
  const [retrying, setRetrying] = useState(false);
  const pending = state.decisions.filter((d) => d.status === "PENDING");
  const invoiceFailed = job.status === "VERIFIED" && job.metadata?.invoice_action === "FAILED";
  const lastRequest = [...state.events].reverse().find((e) => e.type === "EVIDENCE_REQUESTED");
  const requestText =
    (lastRequest?.payload.result as { message?: string } | undefined)?.message ?? lastRequest?.message ?? null;
  const lastFailure = [...state.events].reverse().find((e) => e.type === "WORKFLOW_RUN_FAILED");

  async function retry() {
    setRetrying(true);
    try {
      await clientApi.retry(job.id);
      toast.push({ tone: "info", title: "Retry requested", description: "FieldProof is running the workflow again." });
      await onRetried();
    } catch (error) {
      toast.push({ tone: "danger", title: "Retry was not accepted", description: errorMessage(error) });
    } finally {
      setRetrying(false);
    }
  }

  let banner: { key: string; tone: string; icon: React.ReactNode; title: string; body?: React.ReactNode; action?: React.ReactNode } | null = null;

  if (job.status === "WAITING_FOR_DECISION" && pending.length > 0) {
    const d = pending[0];
    banner = {
      key: `decision-${d.id}`,
      tone: "border-blocking-line bg-blocking-soft",
      icon: <Gavel aria-hidden weight="fill" className="size-5 text-blocking" />,
      title: pending.length > 1 ? `${pending.length} decisions are waiting on a supervisor` : "One decision is waiting on a supervisor",
      body: (
        <>
          {d.question}
          {d.financial_impact !== 0 && <span className="font-semibold"> ({signedMoney(d.financial_impact)})</span>}
        </>
      ),
      action: (
        <ButtonLink href={`/decisions/${d.id}`} iconRight={<ArrowRight weight="bold" className="size-4" />}>
          Review decision
        </ButtonLink>
      ),
    };
  } else if (job.status === "WAITING_FOR_EVIDENCE") {
    banner = {
      key: "evidence",
      tone: "border-waiting-line bg-waiting-soft",
      icon: <Hourglass aria-hidden weight="fill" className="size-5 text-waiting" />,
      title: `Waiting on ${job.technician_name ?? job.technician_id}`,
      body: requestText ? <>FieldProof asked: &ldquo;{requestText}&rdquo;</> : "FieldProof asked the technician for more evidence.",
      action: (
        <ButtonLink href={`/field/${job.id}`} variant="secondary" icon={<DeviceMobile className="size-4" />}>
          Technician view
        </ButtonLink>
      ),
    };
  } else if (job.status === "FAILED" || invoiceFailed) {
    banner = {
      key: "failed",
      tone: "border-blocking-line bg-blocking-soft",
      icon: <HandPalm aria-hidden weight="fill" className="size-5 text-blocking" />,
      title: invoiceFailed ? "The invoice provider failed" : "Verification paused after an internal error",
      body: invoiceFailed
        ? "The job stays verified; nothing is lost. Retry to finish invoicing and close the job."
        : (lastFailure?.payload.error as string | undefined) ?? "It resumes on the next event, or you can retry now.",
      action: (
        <Button onClick={retry} loading={retrying} icon={<ArrowsClockwise className="size-4" />}>
          Retry
        </Button>
      ),
    };
  } else if (job.status === "CLOSED") {
    banner = {
      key: "closed",
      tone: "border-verified-line bg-verified-soft",
      icon: <SealCheck aria-hidden weight="fill" className="size-5 text-verified" />,
      title: `Closed${job.closed_at ? ` ${dateTime(job.closed_at)}` : ""}`,
      body: (
        <>
          Final amount <span className="font-semibold">{money(job.final_amount)}</span>. The evidence receipt is sealed.
        </>
      ),
      action: (
        <ButtonLink href={`/jobs/${job.id}/receipt`} variant="secondary" icon={<Receipt className="size-4" />}>
          View receipt
        </ButtonLink>
      ),
    };
  } else if (job.status === "OPEN" || job.status === "IN_PROGRESS") {
    banner = {
      key: "field",
      tone: "border-line bg-surface",
      icon: <DeviceMobile aria-hidden className="size-5 text-muted" />,
      title: "The technician is on site",
      body: "Verification starts automatically when they complete the job.",
      action: (
        <ButtonLink href={`/field/${job.id}`} variant="secondary" icon={<DeviceMobile className="size-4" />}>
          Technician view
        </ButtonLink>
      ),
    };
  } else {
    banner = {
      key: "active",
      tone: "border-accent-line bg-accent-soft",
      icon: <span aria-hidden className="live-dot mx-1 text-accent" />,
      title: "FieldProof is working on this job",
      body: JOB_STATUS[job.status].hint,
    };
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={banner.key}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.3 }}
        role="status"
        className={cx("flex flex-col gap-4 rounded-panel border p-4 sm:flex-row sm:items-center sm:p-5", banner.tone)}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface/80">{banner.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{banner.title}</p>
          {banner.body && <p className="mt-0.5 text-caption text-ink-2">{banner.body}</p>}
        </div>
        {banner.action && <div className="shrink-0">{banner.action}</div>}
      </motion.div>
    </AnimatePresence>
  );
}
