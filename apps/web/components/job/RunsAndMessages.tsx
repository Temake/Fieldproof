"use client";

import { ChatText, PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr";
import { clientApi } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { cx } from "@/lib/cx";
import { dateTime } from "@/lib/format";
import type { Job, SentMessage, WorkflowRun } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";
import { WORKFLOW_NODE } from "@/lib/vocabulary";
import { Alert } from "../ui/alert";
import { Badge } from "../ui/badge";
import { EmptyState, Skeleton } from "../ui/feedback";
import { Panel, PanelHeader } from "../ui/panel";

interface Data {
  runs: WorkflowRun[] | null;
  messages: SentMessage[] | null;
}

/**
 * PRD 35 - every run exposes workflow id, trigger, steps, tools called,
 * duration, result and error. Loaded only while this tab is open.
 */
export function RunsAndMessages({ job, active }: { job: Job; active: boolean }) {
  const poll = usePoll<Data>(
    async () => {
      const [runs, messages] = await Promise.all([clientApi.runs(job.id), clientApi.messages(job.id)]);
      return { runs, messages };
    },
    { runs: null, messages: null },
    { interval: (d) => (d.runs === null ? 0 : active ? 1500 : 6000) },
  );
  const { runs, messages } = poll.data;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Panel aria-labelledby="runs-heading">
        <PanelHeader
          id="runs-heading"
          title="Workflow runs"
          description="Each run starts from an event and ends when the job closes or waits on someone."
        />
        {poll.error && runs === null ? (
          <Alert tone="danger" title="Could not load runs">
            {errorMessage(poll.error)}
          </Alert>
        ) : runs === null ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : runs.length === 0 ? (
          <EmptyState title="No runs yet">A run starts when the technician completes the job.</EmptyState>
        ) : (
          <ol className="space-y-3">
            {[...runs].reverse().map((run) => {
              const failed = run.type === "WORKFLOW_RUN_FAILED";
              return (
                <li key={run.run_id} className={cx("rounded-control border p-4", failed ? "border-blocking-line bg-blocking-soft/40" : "border-line")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-caption font-semibold text-ink">{run.run_id}</p>
                    <Badge tone={failed ? "blocking" : run.outcome === "CLOSED" ? "verified" : "neutral"}>
                      {run.outcome.replaceAll("_", " ").toLowerCase()}
                    </Badge>
                  </div>
                  <p className="mt-1 text-micro text-muted">
                    {dateTime(run.created_at)} · {run.duration_ms} ms · trigger {run.trigger ?? "event"}
                  </p>
                  <ol className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Steps">
                    {run.steps.map((step, i) => (
                      <li key={`${step}-${i}`} className="flex items-center gap-1.5">
                        {i > 0 && <span aria-hidden className="h-px w-2 bg-line-strong" />}
                        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-accent-ink">
                          {WORKFLOW_NODE[step]?.label ?? step}
                        </span>
                      </li>
                    ))}
                  </ol>
                  {run.tools_called.length > 0 && (
                    <p className="mt-2 text-micro text-muted">
                      Tools: <span className="font-mono text-ink-2">{run.tools_called.join(", ")}</span>
                    </p>
                  )}
                  {run.error && <p className="mt-2 font-mono text-micro text-blocking-ink">{run.error}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </Panel>

      <Panel aria-labelledby="messages-heading">
        <PanelHeader
          id="messages-heading"
          title="Messages sent"
          description="What FieldProof told the technician and the customer."
        />
        {messages === null ? (
          <Skeleton className="h-20 w-full" />
        ) : messages.length === 0 ? (
          <EmptyState icon={<ChatText className="size-6" />} title="No messages in this session">
            Delivery is simulated for the MVP and kept in the API&apos;s memory, so messages from before its last
            restart are not listed. Requests still appear on the timeline.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => {
              const toTech = m.recipient === job.technician_id;
              return (
                <li key={m.id} className="rounded-control border border-line p-3">
                  <p className="flex items-center gap-2 text-micro font-semibold text-muted">
                    <PaperPlaneTilt aria-hidden className="size-3.5" />
                    To {toTech ? (job.technician_name ?? m.recipient) : m.recipient === job.customer_id ? "the customer" : m.recipient}
                  </p>
                  <p className="mt-1.5 text-caption text-ink">{m.message}</p>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
