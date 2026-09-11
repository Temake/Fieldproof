"use client";

import { motion } from "framer-motion";
import { Check, WarningOctagon } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/lib/cx";
import type { JobEvent, WorkflowNode } from "@/lib/types";
import { BRANCH_NODES, CORE_NODES, WORKFLOW_NODE } from "@/lib/vocabulary";

type NodeState = "done" | "current" | "failed" | "pending" | "skipped";

interface RunView {
  runId: string | null;
  started: WorkflowNode[];
  finished: boolean;
  failed: boolean;
  outcome: string | null;
  durationMs: number | null;
  runCount: number;
}

function latestRun(events: JobEvent[]): RunView {
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const runIds = [...new Set(sorted.filter((e) => e.run_id).map((e) => e.run_id as string))];
  const runId = runIds.at(-1) ?? null;
  const run = sorted.filter((e) => e.run_id === runId);
  const end = run.find((e) => e.type === "WORKFLOW_RUN_COMPLETED" || e.type === "WORKFLOW_RUN_FAILED");
  return {
    runId,
    started: run.filter((e) => e.type === "AGENT_STEP_STARTED").map((e) => e.payload.node as WorkflowNode),
    finished: Boolean(end),
    failed: end?.type === "WORKFLOW_RUN_FAILED",
    outcome: (end?.payload.outcome as string | undefined) ?? null,
    durationMs: (end?.payload.duration_ms as number | undefined) ?? null,
    runCount: runIds.length,
  };
}

/**
 * The orchestrator's path for the latest run (agents/orchestrator/graph.py):
 * four fixed steps, then exactly one branch. It is how a viewer sees *where*
 * FieldProof is, not just that it is busy.
 */
export function WorkflowTracker({ events, idle }: { events: JobEvent[]; idle?: string }) {
  const run = latestRun(events);
  const branch = BRANCH_NODES.find((n) => run.started.includes(n)) ?? null;
  const path: WorkflowNode[] = [...CORE_NODES, branch ?? "ACTION"];

  function stateOf(node: WorkflowNode, index: number): NodeState {
    if (!run.runId) return "pending";
    if (index === CORE_NODES.length && !branch) return run.finished ? "skipped" : "pending";
    const reached = run.started.includes(node);
    if (!reached) return "pending";
    const isLast = run.started.at(-1) === node;
    if (isLast && !run.finished) return "current";
    if (isLast && run.failed) return "failed";
    return "done";
  }

  const states = path.map(stateOf);
  // The rail runs between the first and last node centres; fill to the furthest node reached.
  const reached = states.reduce((max, s, i) => (s === "done" || s === "current" || s === "failed" ? i : max), -1);
  const fill = reached <= 0 ? 0 : reached / (path.length - 1);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          {run.runId ? (run.finished ? "Latest run" : "Running now") : "Workflow"}
          {run.runCount > 1 && <span className="font-normal text-muted"> · run {run.runCount}</span>}
        </p>
        <p className="font-mono text-micro text-muted">
          {run.runId
            ? run.finished
              ? `${run.runId} · ${run.durationMs ?? "?"} ms · ${String(run.outcome ?? "").replaceAll("_", " ").toLowerCase()}`
              : run.runId
            : (idle ?? "Starts when the technician completes the job.")}
        </p>
      </div>

      <ol className="relative grid grid-cols-5 gap-1 sm:gap-2" aria-label="Workflow steps">
        <span aria-hidden className="absolute top-[0.9rem] right-[10%] left-[10%] h-0.5 rounded-full bg-line" />
        <motion.span
          aria-hidden
          className="absolute top-[0.9rem] left-[10%] h-0.5 origin-left rounded-full bg-accent"
          style={{ width: "80%" }}
          initial={false}
          animate={{ scaleX: fill }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
        {path.map((node, i) => {
          const state = states[i];
          const isBranch = i === CORE_NODES.length;
          return (
            <li key={node} className="relative flex flex-col items-center text-center" aria-current={state === "current" ? "step" : undefined}>
              <span
                className={cx(
                  "relative grid size-[1.85rem] place-items-center rounded-full border-2 transition-colors duration-300",
                  state === "done" && "border-accent bg-accent text-on-accent",
                  state === "current" && "border-accent bg-surface text-accent",
                  state === "failed" && "border-blocking bg-blocking text-surface",
                  (state === "pending" || state === "skipped") && "border-line-strong bg-surface text-faint",
                )}
              >
                {state === "done" && <Check aria-hidden weight="bold" className="size-3.5" />}
                {state === "failed" && <WarningOctagon aria-hidden weight="fill" className="size-3.5" />}
                {state === "current" && <span aria-hidden className="live-dot text-accent" />}
                {(state === "pending" || state === "skipped") && (
                  <span aria-hidden className="size-1.5 rounded-full bg-line-strong" />
                )}
              </span>
              <span
                className={cx(
                  "mt-2 text-[0.6875rem] leading-tight font-semibold sm:text-micro",
                  state === "pending" || state === "skipped" ? "text-muted" : "text-ink",
                )}
              >
                {isBranch && !branch ? "Outcome" : WORKFLOW_NODE[node].label}
              </span>
              <span className="mt-0.5 hidden text-[0.6875rem] leading-snug text-muted lg:block">
                {isBranch && !branch ? "Ask, escalate, or close" : WORKFLOW_NODE[node].hint}
              </span>
              <span className="sr-only">
                {state === "done" ? "completed" : state === "current" ? "in progress" : state === "failed" ? "failed" : "not reached"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
