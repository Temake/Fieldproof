"use client";

import { motion, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/cx";
import { Reveal } from "../motion/reveal";

interface Stage {
  key: string;
  label: string;
  title: string;
  body: string;
  tag?: string;
}

const CORE: Stage[] = [
  {
    key: "context",
    label: "Load context",
    title: "It starts with the work order.",
    body: "What must be proven, the spending allowance, and the actions FieldProof is allowed to take on this job.",
  },
  {
    key: "parse",
    label: "Parse evidence",
    title: "The only step that uses a model.",
    body: "Each photo, receipt, signature and voice note becomes observations with a confidence score. Unreadable files, or files whose bytes changed after upload, count as nothing.",
    tag: "Model",
  },
  {
    key: "reconcile",
    label: "Reconcile",
    title: "Requirements, claims and evidence, compared from scratch.",
    body: "Every pass recomputes everything, so a replaced photo can never leave a stale conclusion behind.",
  },
  {
    key: "policy",
    label: "Policy check",
    title: "A fixed rulebook decides what each conflict needs.",
    body: "Resolve it automatically, ask the technician, or ask a supervisor. Unknown conflicts fail closed and go to a person.",
  },
];

const OUTCOMES: Stage[] = [
  {
    key: "ask",
    label: "Ask technician",
    title: "Missing evidence is recovered first.",
    body: "Everything missing goes out as one message. The run stops; the reply starts a new run.",
    tag: "Pauses",
  },
  {
    key: "escalate",
    label: "Ask supervisor",
    title: "One question, with the case attached.",
    body: "The evidence, the money and the policy that made it a question, on a single card.",
    tag: "Pauses",
  },
  {
    key: "close",
    label: "Close out",
    title: "Then it finishes the job itself.",
    body: "Closeout report, invoice, customer package, and a receipt sealed with a SHA-256 hash.",
  },
];

const STAGES = [...CORE, ...OUTCOMES];

export function HowItCloses() {
  const [active, setActive] = useState(0);

  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-20 border-y border-line bg-surface">
      <div className="mx-auto max-w-[1240px] px-4 py-24 sm:px-6 lg:py-32">
        <Reveal className="max-w-[44rem]">
          <p className="mb-4 inline-flex items-center gap-2 text-caption font-semibold text-accent-ink">
            <span aria-hidden className="size-2 rounded-[3px] bg-accent" />
            How it works
          </p>
          <h2 id="how-title" className="text-title text-ink">
            Four steps on every run, then exactly one outcome.
          </h2>
          <p className="mt-5 max-w-[60ch] text-lead text-ink-2">
            Waiting is a real stop. The next event starts a fresh run, so nothing sleeps and a restart loses nothing.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-12 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-20">
          <div className="hidden lg:block">
            <div className="sticky top-28">
              <Diagram active={active} />
            </div>
          </div>

          <ol className="space-y-6 lg:space-y-0">
            {STAGES.map((stage, i) => (
              <StageBlock key={stage.key} stage={stage} index={i} active={active === i} onActive={setActive} />
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function StageBlock({
  stage,
  index,
  active,
  onActive,
}: {
  stage: Stage;
  index: number;
  active: boolean;
  onActive: (i: number) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const inView = useInView(ref, { margin: "-45% 0px -45% 0px" });

  useEffect(() => {
    if (inView) onActive(index);
  }, [inView, index, onActive]);

  const outcome = index >= CORE.length;
  return (
    <li ref={ref} className="lg:flex lg:min-h-[52vh] lg:items-center">
      <motion.div
        animate={{ opacity: active ? 1 : 0.4 }}
        transition={{ duration: 0.4 }}
        className="max-w-[34rem] border-l-2 pl-6 transition-colors duration-500 lg:pl-8"
        style={{ borderColor: active ? "var(--accent)" : "var(--line)" }}
      >
        <p className="flex items-center gap-2 text-caption font-semibold text-accent-ink">
          {outcome ? `Outcome: ${stage.label.toLowerCase()}` : stage.label}
          {stage.tag && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-accent-ink">{stage.tag}</span>
          )}
        </p>
        <h3 className="mt-2 text-heading text-ink">{stage.title}</h3>
        <p className="mt-3 text-body text-ink-2">{stage.body}</p>
      </motion.div>
    </li>
  );
}

function Node({ stage, index, active, compact }: { stage: Stage; index: number; active: number; compact?: boolean }) {
  const on = index === active;
  const past = index < CORE.length && active >= index;
  return (
    <div
      className={cx(
        "relative flex items-center justify-center rounded-control border text-center font-semibold transition-colors duration-500",
        compact ? "h-16 px-2 text-micro" : "h-12 px-4 text-sm",
        on ? "border-accent bg-accent text-on-accent shadow-float" : past ? "border-accent-line bg-accent-soft text-accent-ink" : "border-line bg-canvas text-ink-2",
      )}
    >
      {on && (
        <motion.span
          layoutId="how-token"
          aria-hidden
          className="absolute -left-1.5 size-3 rounded-full border-2 border-surface bg-accent"
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      )}
      {stage.label}
    </div>
  );
}

function Diagram({ active }: { active: number }) {
  return (
    <figure aria-label="The FieldProof workflow graph" className="rounded-panel border border-line bg-canvas/60 p-6">
      <div className="flex flex-col items-stretch">
        {CORE.map((stage, i) => (
          <div key={stage.key} className="flex flex-col items-center">
            <div className="w-full">
              <Node stage={stage} index={i} active={active} />
            </div>
            <span aria-hidden className={cx("h-6 w-px transition-colors duration-500", active > i ? "bg-accent" : "bg-line-strong")} />
          </div>
        ))}
        <div aria-hidden className="relative mx-[16.5%] h-4 border-x border-t border-line-strong">
          <span className="absolute top-0 left-1/2 h-full w-px -translate-x-1/2 bg-line-strong" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {OUTCOMES.map((stage, i) => (
            <Node key={stage.key} stage={stage} index={CORE.length + i} active={active} compact />
          ))}
        </div>
      </div>
      <figcaption className="mt-5 text-micro text-muted">
        agents/orchestrator/graph.py. Deterministic: the agents do not discuss the job with each other.
      </figcaption>
    </figure>
  );
}
