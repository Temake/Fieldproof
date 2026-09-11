"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  ClipboardText,
  Gavel,
  Hourglass,
  MagnifyingGlass,
  Plus,
  Pulse,
  SealCheck,
} from "@phosphor-icons/react/dist/ssr";
import { clientApi } from "@/lib/api/client";
import { cx } from "@/lib/cx";
import { money, relative, signedMoney } from "@/lib/format";
import type { DashboardCounts, Decision, Job, JobStatus } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";
import { LiveIndicator } from "./LiveIndicator";
import { StatusPill } from "./StatusPill";
import { Ticker } from "./motion/ticker";
import { ButtonLink } from "./ui/button";
import { EmptyState } from "./ui/feedback";
import { Input } from "./ui/field";

interface DashboardData {
  counts: DashboardCounts;
  jobs: Job[];
  decisions: Decision[];
}

type Filter = "all" | "attention" | "active" | "field" | "closed";

const FILTERS: { key: Filter; label: string; statuses: JobStatus[] | null }[] = [
  { key: "all", label: "All", statuses: null },
  { key: "attention", label: "Needs people", statuses: ["WAITING_FOR_DECISION", "WAITING_FOR_EVIDENCE", "FAILED"] },
  { key: "active", label: "Verifying", statuses: ["SUBMITTED", "VERIFYING", "VERIFIED", "CLOSING"] },
  { key: "field", label: "In the field", statuses: ["OPEN", "IN_PROGRESS"] },
  { key: "closed", label: "Closed", statuses: ["CLOSED"] },
];

/** Jobs that need a person sort first; then newest. */
const PRIORITY: Record<JobStatus, number> = {
  WAITING_FOR_DECISION: 0,
  FAILED: 1,
  WAITING_FOR_EVIDENCE: 2,
  SUBMITTED: 3,
  VERIFYING: 3,
  VERIFIED: 3,
  CLOSING: 3,
  IN_PROGRESS: 4,
  OPEN: 5,
  CLOSED: 6,
};

async function fetchDashboard(): Promise<DashboardData> {
  const [counts, jobs, decisions] = await Promise.all([
    clientApi.dashboard(),
    clientApi.jobs(),
    clientApi.decisions("PENDING"),
  ]);
  return { counts, jobs, decisions };
}

export function DashboardLive({ initial }: { initial: DashboardData }) {
  const poll = usePoll(fetchDashboard, initial, {
    interval: (d) => (d.counts.processing > 0 ? 2000 : 5000),
  });
  const { counts, jobs, decisions } = poll.data;
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const cards = [
    {
      key: "active" as const,
      label: "Processing",
      value: counts.processing,
      Icon: Pulse,
      tone: "text-accent",
      hint: "FieldProof is verifying right now",
    },
    {
      key: "closed" as const,
      label: "Closed automatically",
      value: counts.closed_automatically,
      Icon: SealCheck,
      tone: "text-verified",
      hint: "Sealed with an evidence receipt",
    },
    {
      key: "attention" as const,
      label: "Waiting on technician",
      value: counts.waiting_on_technician,
      Icon: Hourglass,
      tone: "text-waiting",
      hint: "FieldProof asked for evidence",
    },
    {
      key: "attention" as const,
      label: "Decision required",
      value: counts.decision_required,
      Icon: Gavel,
      tone: "text-blocking",
      hint: "One question for a supervisor",
      urgent: counts.decision_required > 0,
    },
  ];

  const visible = useMemo(() => {
    const statuses = FILTERS.find((f) => f.key === filter)?.statuses;
    const needle = query.trim().toLowerCase();
    return jobs
      .filter((job) => !statuses || statuses.includes(job.status))
      .filter(
        (job) =>
          !needle ||
          [job.id, job.description, job.technician_name, job.technician_id, job.site_address, job.customer_id]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(needle)),
      )
      .sort(
        (a, b) =>
          PRIORITY[a.status] - PRIORITY[b.status] ||
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
  }, [jobs, filter, query]);

  const filterCounts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((f) => [f.key, f.statuses ? jobs.filter((j) => f.statuses!.includes(j.status)).length : jobs.length]),
      ) as Record<Filter, number>,
    [jobs],
  );

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-title text-ink">Operations</h1>
          <p className="mt-2 max-w-[60ch] text-body text-muted">
            Every work order FieldProof is verifying, waiting on, or has closed. People only appear where a person is
            needed.
          </p>
        </div>
        <LiveIndicator updatedAt={poll.updatedAt} error={poll.error} />
      </header>

      <section aria-label="Job counts" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {cards.map((card, i) => (
          <motion.button
            key={card.label}
            type="button"
            onClick={() => setFilter(card.key)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ y: -2 }}
            className={cx(
              "group relative flex flex-col items-start rounded-panel border bg-surface p-4 text-left shadow-raised transition-[border-color,box-shadow] sm:p-5",
              card.urgent ? "border-blocking-line ring-1 ring-blocking-line" : "border-line hover:border-line-strong",
            )}
          >
            <span className="flex w-full items-center justify-between">
              <card.Icon aria-hidden className={cx("size-5", card.tone)} weight={card.urgent ? "fill" : "regular"} />
              <ArrowRight
                aria-hidden
                className="size-4 -translate-x-1 text-faint opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
              />
            </span>
            <Ticker value={card.value} className="mt-5 text-[2.25rem] leading-none font-bold tracking-[-0.03em] text-ink [font-stretch:88%]" />
            <span className="mt-2 text-sm font-semibold text-ink">{card.label}</span>
            <span className="mt-0.5 hidden text-micro text-muted sm:block">{card.hint}</span>
          </motion.button>
        ))}
      </section>

      {decisions.length > 0 && (
        <section aria-labelledby="needs-decision">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="needs-decision" className="text-subheading text-ink">
              Needs a decision
            </h2>
            <Link href="/decisions" className="text-caption font-semibold text-accent-ink hover:underline">
              All decisions
            </Link>
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            <AnimatePresence initial={false}>
              {decisions.slice(0, 4).map((decision) => (
                <motion.li
                  key={decision.id}
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                >
                  <Link
                    href={`/decisions/${decision.id}`}
                    className="group flex h-full items-start gap-4 rounded-panel border border-blocking-line bg-blocking-soft/60 p-4 transition-colors hover:bg-blocking-soft"
                  >
                    <Gavel aria-hidden weight="fill" className="mt-0.5 size-5 shrink-0 text-blocking" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">{decision.question}</p>
                      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-micro text-ink-2">
                        <span className="font-mono">{decision.job_id}</span>
                        {decision.financial_impact !== 0 && (
                          <span className="font-semibold">{signedMoney(decision.financial_impact)}</span>
                        )}
                        <span>{relative(decision.created_at)}</span>
                      </p>
                    </div>
                    <ArrowRight
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 text-blocking-ink transition-transform group-hover:translate-x-0.5"
                    />
                  </Link>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </section>
      )}

      <section aria-labelledby="jobs-heading">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 id="jobs-heading" className="text-subheading text-ink">
            Work orders
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div role="radiogroup" aria-label="Filter work orders" className="flex overflow-x-auto rounded-control border border-line bg-sunken p-1">
              {FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setFilter(f.key)}
                    className={cx(
                      "relative flex h-8 shrink-0 items-center gap-1.5 rounded-[7px] px-3 text-[0.8125rem] font-semibold whitespace-nowrap transition-colors",
                      active ? "text-ink" : "text-muted hover:text-ink",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="dashboard-filter"
                        aria-hidden
                        className="absolute inset-0 rounded-[7px] border border-line bg-surface shadow-raised"
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      />
                    )}
                    <span className="relative">{f.label}</span>
                    <span className="relative text-muted tabular">{filterCounts[f.key]}</span>
                  </button>
                );
              })}
            </div>
            <div className="relative sm:w-64">
              <MagnifyingGlass aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <label htmlFor="job-search" className="sr-only">
                Search work orders
              </label>
              <Input
                id="job-search"
                type="search"
                placeholder="Search job, technician, site"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </div>

        {jobs.length === 0 ? (
          <div className="rounded-panel border border-dashed border-line-strong bg-surface">
            <EmptyState
              icon={<ClipboardText className="size-6" />}
              title="No work orders yet"
              action={
                <ButtonLink href="/jobs/new" icon={<Plus weight="bold" className="size-4" />}>
                  Create a work order
                </ButtonLink>
              }
            >
              Create one here, or load the demo jobs with{" "}
              <code className="rounded bg-sunken px-1 font-mono text-micro">python scripts/seed.py --all</code>.
            </EmptyState>
          </div>
        ) : (
          <div className="overflow-hidden rounded-panel border border-line bg-surface shadow-raised">
            <div
              aria-hidden
              className="hidden grid-cols-[8.5rem_minmax(0,1fr)_10rem_11.5rem_7.5rem] gap-4 border-b border-line bg-sunken/60 px-5 py-2.5 text-label text-muted md:grid"
            >
              <span>Job</span>
              <span>Work</span>
              <span>Technician</span>
              <span>Status</span>
              <span className="text-right">Amount</span>
            </div>
            {visible.length === 0 ? (
              <EmptyState icon={<MagnifyingGlass className="size-6" />} title="No work orders match">
                <button
                  type="button"
                  onClick={() => {
                    setFilter("all");
                    setQuery("");
                  }}
                  className="font-semibold text-accent-ink hover:underline"
                >
                  Clear the filters
                </button>
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                <AnimatePresence initial={false} mode="popLayout">
                  {visible.map((job) => (
                    <motion.li
                      key={job.id}
                      layout="position"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      <JobRow job={job} />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function JobRow({ job }: { job: Job }) {
  const amount = job.final_amount ?? job.authorized_amount;
  return (
    <Link
      href={`/jobs/${job.id}`}
      className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 transition-colors hover:bg-sunken/70 focus-visible:bg-sunken md:grid-cols-[8.5rem_minmax(0,1fr)_10rem_11.5rem_7.5rem] md:px-5"
    >
      <span className="font-mono text-[0.8125rem] font-semibold text-ink">{job.id}</span>
      <span className="justify-self-end md:hidden">
        <StatusPill kind="job" status={job.status} />
      </span>
      <span className="col-span-2 truncate text-sm text-ink-2 md:col-span-1">{job.description || "No description"}</span>
      <span className="hidden truncate text-sm text-ink-2 md:block">{job.technician_name ?? job.technician_id}</span>
      <span className="hidden md:block">
        <StatusPill kind="job" status={job.status} />
      </span>
      <span className="col-span-2 text-micro text-muted md:col-span-1 md:text-right md:text-sm md:font-semibold md:text-ink md:tabular">
        <span className="md:hidden">{job.technician_name ?? job.technician_id} · </span>
        {money(amount)}
      </span>
    </Link>
  );
}
