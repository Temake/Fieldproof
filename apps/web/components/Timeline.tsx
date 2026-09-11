"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, type ComponentType } from "react";
import {
  ArrowsClockwise,
  ChatText,
  ClipboardText,
  CurrencyDollar,
  FileText,
  Files,
  Gavel,
  HandPalm,
  PaperPlaneTilt,
  Scales,
  SealCheck,
  ShieldCheck,
  SignIn,
  UploadSimple,
  UserCheck,
  WarningOctagon,
} from "@phosphor-icons/react/dist/ssr";
import type { IconProps } from "@phosphor-icons/react";
import { cx } from "@/lib/cx";
import { clock, dateTime } from "@/lib/format";
import type { Job, JobEvent, JobStatus, WorkflowNode } from "@/lib/types";
import { JOB_STATUS, WORKFLOW_NODE, type Tone } from "@/lib/vocabulary";

/**
 * PRD 14 Screen 2 and PRD 35. The timeline is the product's proof of
 * autonomy, rendered from the same events the workflow emits for
 * observability. Every line says who acted: FieldProof, the technician, or a
 * named supervisor.
 */

type Icon = ComponentType<IconProps>;

interface Line {
  event: JobEvent;
  kind: "agent" | "person" | "status" | "system";
  who: string;
  title: string;
  quote?: string;
  tone: Tone;
  icon: Icon;
}

const PERSON_TYPES = new Set(["JOB_COMPLETED", "EVIDENCE_UPLOADED", "WORKFLOW_RETRY_REQUESTED"]);

function personName(actor: string, job: Job): string {
  if (actor === job.technician_id || actor === "fieldproof") return job.technician_name ?? job.technician_id;
  if (actor === job.customer_id) return "Customer";
  return actor.charAt(0).toUpperCase() + actor.slice(1);
}

function splitMessage(message: string): { title: string; quote?: string } {
  const colon = message.indexOf(": ");
  if (colon > 0 && colon < 60) return { title: message.slice(0, colon), quote: message.slice(colon + 2) };
  return { title: message };
}

function actionIcon(message: string): Icon {
  const m = message.toLowerCase();
  if (m.includes("invoice")) return CurrencyDollar;
  if (m.includes("customer")) return PaperPlaneTilt;
  if (m.includes("receipt")) return SealCheck;
  if (m.includes("report")) return FileText;
  return ShieldCheck;
}

const NODE_ICON: Partial<Record<WorkflowNode, Icon>> = {
  LOAD_CONTEXT: ClipboardText,
  PARSE_EVIDENCE: Files,
  RECONCILE: Scales,
  POLICY_CHECK: ShieldCheck,
};

function toLine(event: JobEvent, job: Job, showSystem: boolean): Line | null {
  const payload = event.payload ?? {};
  const node = payload.node as WorkflowNode | undefined;

  if (event.type === "JOB_STATUS_CHANGED" && !event.message) {
    const status = payload.status as JobStatus | undefined;
    if (!status) return null;
    const term = JOB_STATUS[status];
    return { event, kind: "status", who: "", title: term?.label ?? status, tone: term?.tone ?? "neutral", icon: ShieldCheck };
  }

  if (event.type === "AGENT_STEP_STARTED" || event.type === "WORKFLOW_RUN_COMPLETED" || event.type === "WORKFLOW_RUN_FAILED") {
    if (!showSystem) return null;
    if (event.type === "AGENT_STEP_STARTED") {
      return {
        event,
        kind: "system",
        who: "FieldProof",
        title: `Step started: ${node ? (WORKFLOW_NODE[node]?.label ?? node) : "unknown"}`,
        tone: "agent",
        icon: NODE_ICON[node as WorkflowNode] ?? ShieldCheck,
      };
    }
    const steps = Array.isArray(payload.steps) ? payload.steps.length : 0;
    const tools = Array.isArray(payload.tools_called) ? (payload.tools_called as string[]) : [];
    const failed = event.type === "WORKFLOW_RUN_FAILED";
    return {
      event,
      kind: "system",
      who: "FieldProof",
      title: `Run ${failed ? "failed" : "finished"} in ${payload.duration_ms ?? "?"} ms, ${steps} steps, outcome ${String(payload.outcome ?? "").replaceAll("_", " ").toLowerCase()}`,
      quote: failed ? String(payload.error ?? "") : tools.length ? `Tools called: ${tools.join(", ")}` : undefined,
      tone: failed ? "blocking" : "neutral",
      icon: failed ? WarningOctagon : ArrowsClockwise,
    };
  }

  if (!event.message) return null;
  const { title, quote } = splitMessage(event.message);
  const result = payload.result as Record<string, unknown> | undefined;
  const rawQuote = typeof result?.message === "string" ? result.message : quote;

  switch (event.type) {
    case "JOB_CREATED":
      return { event, kind: "agent", who: "FieldProof", title, tone: "neutral", icon: ClipboardText };
    case "EVIDENCE_REQUESTED":
      return { event, kind: "agent", who: "FieldProof", title, quote: rawQuote, tone: "waiting", icon: ChatText };
    case "DECISION_REQUESTED":
      return { event, kind: "agent", who: "FieldProof", title, quote, tone: "blocking", icon: Gavel };
    case "DECISION_RESOLVED": {
      if (event.actor === "fieldproof") {
        return { event, kind: "agent", who: "FieldProof", title, quote, tone: "neutral", icon: Gavel };
      }
      const decision = payload.decision as string | undefined;
      const tone: Tone = decision === "APPROVE" ? "verified" : decision === "REJECT" ? "blocking" : "waiting";
      return { event, kind: "person", who: personName(event.actor, job), title, tone, icon: UserCheck };
    }
    case "JOB_VERIFIED":
      return { event, kind: "agent", who: "FieldProof", title, tone: "verified", icon: SealCheck };
    case "ACTION_EXECUTED":
      return { event, kind: "agent", who: "FieldProof", title, quote: undefined, tone: "verified", icon: actionIcon(event.message) };
    case "ACTION_FAILED":
      return { event, kind: "agent", who: "FieldProof", title, quote, tone: "blocking", icon: WarningOctagon };
    case "JOB_STATUS_CHANGED": {
      const status = payload.status as JobStatus | undefined;
      const closed = status === "CLOSED";
      return {
        event,
        kind: "agent",
        who: "FieldProof",
        title,
        tone: closed ? "verified" : status === "FAILED" ? "blocking" : "agent",
        icon: closed ? SealCheck : status === "FAILED" ? HandPalm : SignIn,
      };
    }
    case "AGENT_STEP_COMPLETED":
    case "EVIDENCE_PROCESSED":
      return {
        event,
        kind: "agent",
        who: "FieldProof",
        title,
        quote: event.type === "AGENT_STEP_COMPLETED" && quote ? quote : undefined,
        tone: "agent",
        icon: NODE_ICON[node as WorkflowNode] ?? Files,
      };
    default:
      if (PERSON_TYPES.has(event.type)) {
        return {
          event,
          kind: "person",
          who: personName(event.actor, job),
          title,
          tone: "neutral",
          icon: event.type === "EVIDENCE_UPLOADED" ? UploadSimple : event.type === "WORKFLOW_RETRY_REQUESTED" ? ArrowsClockwise : UserCheck,
        };
      }
      return { event, kind: "agent", who: "FieldProof", title, quote, tone: "agent", icon: ShieldCheck };
  }
}

const NODE_STYLE: Record<Tone, string> = {
  agent: "bg-accent text-on-accent",
  verified: "bg-verified text-on-verified",
  waiting: "bg-waiting text-surface",
  blocking: "bg-blocking text-surface",
  neutral: "bg-surface text-ink-2 ring-1 ring-line-strong",
};

const QUOTE_STYLE: Record<Tone, string> = {
  agent: "border-accent-line bg-accent-soft/60",
  verified: "border-verified-line bg-verified-soft/60",
  waiting: "border-waiting-line bg-waiting-soft/70",
  blocking: "border-blocking-line bg-blocking-soft/70",
  neutral: "border-line bg-sunken",
};

interface TimelineProps {
  events: JobEvent[];
  job: Job;
  showSystem?: boolean;
  /** Current workflow node while a run is in flight. */
  workingOn?: WorkflowNode | null;
}

export function Timeline({ events, job, showSystem = false, workingOn }: TimelineProps) {
  // Events present at first render appear instantly; anything that arrives
  // while the page is open is revealed in sequence, so a run that finished
  // in 100 ms still reads as the steps it took.
  const initialIds = useRef<string[] | null>(null);
  if (initialIds.current === null) initialIds.current = events.map((e) => e.id);
  const seen = useRef<Set<string>>(new Set(initialIds.current));

  // Mark ids as seen after commit, never during render (StrictMode renders twice).
  useEffect(() => {
    for (const e of events) seen.current.add(e.id);
  }, [events]);

  const lines = [...events]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((e) => toLine(e, job, showSystem))
    .filter((l): l is Line => l !== null);

  let freshIndex = 0;

  if (lines.length === 0) {
    return <p className="py-6 text-body text-muted">Nothing has happened on this job yet.</p>;
  }

  return (
    <ol className="relative" aria-label="Job timeline">
      {lines.map((line, index) => {
        const isNew = !seen.current.has(line.event.id);
        const delay = isNew ? Math.min(freshIndex++ * 0.09, 1.6) : 0;
        const last = index === lines.length - 1 && !workingOn;

        if (line.kind === "status") {
          return (
            <motion.li
              key={line.event.id}
              initial={isNew ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={{ delay, duration: 0.4 }}
              className="relative flex items-center gap-3 py-2 pl-[3.1rem]"
            >
              {!last && <span aria-hidden className="absolute top-0 bottom-0 left-[0.9rem] w-px bg-line" />}
              <span className="text-micro font-medium text-muted">
                Status now <span className="font-semibold text-ink-2">{line.title.toLowerCase()}</span>
              </span>
              <span aria-hidden className="h-px flex-1 bg-line" />
            </motion.li>
          );
        }

        const Icon = line.icon;
        return (
          <motion.li
            key={line.event.id}
            initial={isNew ? { opacity: 0, y: 10 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex gap-3 pb-5"
          >
            {!last && <span aria-hidden className="absolute top-8 bottom-0 left-[0.9rem] w-px bg-line" />}
            <span
              aria-hidden
              className={cx(
                "relative z-[1] mt-0.5 grid size-[1.85rem] shrink-0 place-items-center rounded-full",
                line.kind === "person" ? "bg-ink text-canvas" : NODE_STYLE[line.tone],
                line.kind === "system" && "scale-75 opacity-80",
              )}
            >
              <Icon className="size-4" weight={line.kind === "person" ? "bold" : "fill"} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <p className={cx("text-sm", line.kind === "system" ? "text-muted" : "font-medium text-ink")}>
                  {line.title}
                </p>
                <time
                  dateTime={line.event.created_at}
                  title={dateTime(line.event.created_at)}
                  className="font-mono text-[0.6875rem] text-muted tabular"
                >
                  {clock(line.event.created_at, true)}
                </time>
              </div>
              <p className={cx("mt-0.5 text-micro", line.kind === "person" ? "font-semibold text-ink-2" : "text-muted")}>
                {line.kind === "person" ? line.who : "FieldProof"}
              </p>
              {line.quote && (
                <blockquote className={cx("mt-2 rounded-control border px-3 py-2 text-caption text-ink-2", QUOTE_STYLE[line.tone])}>
                  {line.quote}
                </blockquote>
              )}
            </div>
          </motion.li>
        );
      })}

      {workingOn && (
        <motion.li
          key="working"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="relative flex items-center gap-3"
          aria-live="polite"
        >
          <span className="relative grid size-[1.85rem] shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
            <span className="live-dot" />
          </span>
          <p className="text-sm text-accent-ink">
            FieldProof is working: <span className="font-semibold">{WORKFLOW_NODE[workingOn]?.label ?? workingOn}</span>
          </p>
        </motion.li>
      )}
    </ol>
  );
}

/** The node the latest run is on, or null when no run is in flight. */
export function currentNode(events: JobEvent[]): WorkflowNode | null {
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const lastRunEvent = [...sorted].reverse().find((e) => e.run_id);
  if (!lastRunEvent) return null;
  const run = sorted.filter((e) => e.run_id === lastRunEvent.run_id);
  if (run.some((e) => e.type === "WORKFLOW_RUN_COMPLETED" || e.type === "WORKFLOW_RUN_FAILED")) return null;
  const started = run.filter((e) => e.type === "AGENT_STEP_STARTED");
  return (started.at(-1)?.payload.node as WorkflowNode | undefined) ?? "LOAD_CONTEXT";
}
