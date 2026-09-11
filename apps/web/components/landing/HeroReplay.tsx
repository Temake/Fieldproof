"use client";

import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { ArrowCounterClockwise, Check, CheckCircle, Gavel, Hourglass, UserCircle } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/lib/cx";
import { REFERENCE, REFERENCE_EVIDENCE, REFERENCE_REPLAY, type ReplayLine } from "@/lib/reference";
import type { JobStatus } from "@/lib/types";
import { StatusPill } from "../StatusPill";
import { EVIDENCE_ICON } from "../job/evidence-icon";

const WINDOW = 5;
const EASE = [0.16, 1, 0.3, 1] as const;

function derive(shown: ReplayLine[]) {
  let status: JobStatus = "IN_PROGRESS";
  let read = false;
  let followup = false;
  let rereadDone = false;
  for (const line of shown) {
    if (line.status) status = line.status;
    if (line.evidence === "read") read = true;
    if (line.evidence === "followup") followup = true;
    if (line.evidence === "reread") rereadDone = true;
  }
  return { status, read, followup, rereadDone, people: shown.filter((l) => l.pause).length };
}

/**
 * The reference job (JOB-1842) replayed from a real run. It is the product's
 * argument in one panel: FieldProof works, asks the technician once, asks a
 * supervisor once, and closes. Reduced motion shows the finished run.
 */
export function HeroReplay() {
  // The server cannot know the preference, so apply it only after mount;
  // otherwise the first client render would not match the server HTML.
  const prefersReduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduce = mounted && Boolean(prefersReduced);
  const container = useRef<HTMLDivElement>(null);
  const inView = useInView(container, { amount: 0.35 });
  const [step, setStep] = useState(0);
  const [approving, setApproving] = useState(false);

  const done = reduce || step >= REFERENCE_REPLAY.length;
  const count = reduce ? REFERENCE_REPLAY.length : step;
  const shown = REFERENCE_REPLAY.slice(0, count);
  const last = shown.at(-1);
  const waitingOn = !done && last?.pause ? last.pause : null;
  const view = derive(shown);

  useEffect(() => {
    if (reduce || !inView || step >= REFERENCE_REPLAY.length) return;
    const previous = REFERENCE_REPLAY[step - 1];
    const delay = step === 0 ? 700 : previous?.pause === "technician" ? 2600 : previous?.pause === "supervisor" ? 3200 : 950;
    const timers = [window.setTimeout(() => setStep((s) => s + 1), delay)];
    if (previous?.pause === "supervisor") {
      timers.push(window.setTimeout(() => setApproving(true), delay - 900));
    }
    return () => timers.forEach(window.clearTimeout);
  }, [step, inView, reduce]);

  useEffect(() => {
    if (!waitingOn) setApproving(false);
  }, [waitingOn]);

  const { scrollYProgress } = useScroll({ target: container, offset: ["start start", "end start"] });

  return (
    <div ref={container} className="relative">
      {!reduce && <EvidenceChips progress={scrollYProgress} read={view.read} followup={view.followup} reread={view.rereadDone} />}

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.9, delay: 0.25, ease: EASE }}
        className="relative overflow-hidden rounded-panel border border-line bg-surface shadow-float"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="font-mono text-micro font-semibold text-accent-ink">{REFERENCE.jobId}</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-ink">{REFERENCE.description}</p>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={view.status}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="shrink-0"
            >
              <StatusPill kind="job" status={view.status} />
            </motion.span>
          </AnimatePresence>
        </div>

        <div className="relative h-[21rem] overflow-hidden px-5 sm:h-[22.5rem]">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-14 bg-gradient-to-b from-surface to-transparent" />
          <ol aria-label={`${REFERENCE.jobId} timeline replay`} className="absolute inset-x-5 bottom-4 flex flex-col justify-end gap-3.5">
            <AnimatePresence initial={false} mode="popLayout">
              {shown.slice(-WINDOW).map((line, i, arr) => (
                <motion.li
                  key={line.text}
                  layout
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: i === 0 && arr.length === WINDOW ? 0.45 : 1, y: 0 }}
                  exit={{ opacity: 0, y: -14, transition: { duration: 0.3 } }}
                  transition={{ duration: 0.55, ease: EASE }}
                >
                  <ReplayRow line={line} />
                </motion.li>
              ))}
            </AnimatePresence>
            {count === 0 && <li className="text-caption text-muted">Daniel is finishing up on site.</li>}
          </ol>

          <AnimatePresence>
            {waitingOn === "technician" && (
              <motion.div
                key="waiting"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="absolute right-5 bottom-4 left-5 z-[2] flex items-center gap-2 rounded-control border border-waiting-line bg-waiting-soft px-3 py-2 text-caption font-semibold text-waiting-ink shadow-raised"
              >
                <Hourglass aria-hidden weight="fill" className="size-4" />
                Paused. Waiting on {REFERENCE.technician}; nothing is running.
              </motion.div>
            )}
            {waitingOn === "supervisor" && (
              <motion.div
                key="decision"
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.45, ease: EASE }}
                className="absolute right-4 bottom-4 left-4 z-[2] rounded-panel border border-blocking-line bg-surface p-4 shadow-float"
              >
                <p className="flex items-center gap-2 text-micro font-semibold text-blocking-ink">
                  <Gavel aria-hidden weight="fill" className="size-4" /> Decision required
                </p>
                <p className="mt-1.5 text-caption font-medium text-ink">
                  {REFERENCE.observed} verified, {REFERENCE.expected} authorized. Approve the additional $54.00?
                </p>
                <div className="mt-3 flex gap-2" aria-hidden>
                  <motion.span
                    animate={approving ? { scale: [1, 0.94, 1] } : { scale: 1 }}
                    transition={{ duration: 0.35 }}
                    className={cx(
                      "inline-flex h-8 items-center gap-1.5 rounded-control bg-verified px-3 text-micro font-semibold text-on-verified transition-shadow",
                      approving && "ring-4 ring-verified/25",
                    )}
                  >
                    <Check weight="bold" className="size-3.5" /> Approve
                  </motion.span>
                  <span className="inline-flex h-8 items-center rounded-control border border-line-strong px-3 text-micro font-semibold text-ink-2">
                    Reject
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-line bg-sunken/50 px-5 py-3">
          <p className="text-micro text-muted">
            <span className="font-semibold text-ink tabular">{view.people}</span> of{" "}
            <span className="tabular">{REFERENCE_REPLAY.length}</span> steps needed a person
          </p>
          {done && !reduce ? (
            <button
              type="button"
              onClick={() => setStep(0)}
              className="inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-micro font-semibold text-accent-ink transition-colors hover:bg-accent-soft"
            >
              <ArrowCounterClockwise aria-hidden className="size-3.5" />
              Replay
            </button>
          ) : (
            <span className="text-micro text-muted">{done ? "Receipt sealed" : "Replaying a real run"}</span>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function ReplayRow({ line }: { line: ReplayLine }) {
  const person = line.who !== "FieldProof";
  const dot =
    line.tone === "verified"
      ? "bg-verified text-on-verified"
      : line.tone === "waiting"
        ? "bg-waiting text-surface"
        : line.tone === "blocking"
          ? "bg-blocking text-surface"
          : person
            ? "bg-ink text-canvas"
            : "bg-accent text-on-accent";
  return (
    <div className="flex gap-3">
      <span aria-hidden className={cx("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", dot)}>
        {person ? <UserCircle weight="fill" className="size-4" /> : <CheckCircle weight="fill" className="size-3.5" />}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{line.text}</p>
        <p className="text-micro text-muted">{line.who === "Sarah" ? "Sarah, supervisor" : line.who}</p>
        {line.quote && (
          <p
            className={cx(
              "mt-1.5 rounded-control border px-2.5 py-1.5 text-micro text-ink-2",
              line.tone === "blocking" ? "border-blocking-line bg-blocking-soft/60" : "border-waiting-line bg-waiting-soft/70",
            )}
          >
            {line.quote}
          </p>
        )}
      </div>
    </div>
  );
}

// Above and below the panel, never over its content.
const CHIP_POSITIONS = [
  "-top-[4.5rem] -left-[4%]",
  "-top-[6.25rem] left-[34%]",
  "-top-[3.75rem] -right-[3%]",
  "-bottom-[4rem] -left-[6%]",
  "-bottom-[6rem] left-[30%]",
  "-bottom-[3.5rem] right-[2%]",
];

function EvidenceChips({
  progress,
  read,
  followup,
  reread,
}: {
  progress: MotionValue<number>;
  read: boolean;
  followup: boolean;
  reread: boolean;
}) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[2] hidden xl:block">
      {REFERENCE_EVIDENCE.map((artifact, i) => {
        const visible = !artifact.followup || followup;
        const isRead = artifact.followup ? reread : read;
        return (
          <Chip key={artifact.filename} index={i} progress={progress} visible={visible} className={CHIP_POSITIONS[i]}>
            <span
              className={cx(
                "flex items-center gap-2 rounded-full border bg-surface py-1.5 pr-3 pl-1.5 text-micro font-semibold shadow-raised transition-colors duration-500",
                isRead ? "border-verified-line text-ink" : "border-line text-ink-2",
              )}
            >
              <span
                className={cx(
                  "grid size-6 place-items-center rounded-full transition-colors duration-500",
                  isRead ? "bg-verified text-on-verified" : "bg-sunken text-ink-2",
                )}
              >
                {isRead ? <Check weight="bold" className="size-3" /> : <ArtifactIcon type={artifact.type} />}
              </span>
              {artifact.filename}
            </span>
          </Chip>
        );
      })}
    </div>
  );
}

function ArtifactIcon({ type }: { type: keyof typeof EVIDENCE_ICON }) {
  const Icon = EVIDENCE_ICON[type];
  return <Icon className="size-3.5" />;
}

function Chip({
  index,
  progress,
  visible,
  className,
  children,
}: {
  index: number;
  progress: MotionValue<number>;
  visible: boolean;
  className: string;
  children: React.ReactNode;
}) {
  // Each chip drifts at its own depth as the hero scrolls away.
  const depth = [60, 110, 80, 140, 95, 70][index] ?? 80;
  const y = useTransform(progress, [0, 1], [0, -depth]);
  return (
    <motion.div style={{ y }} className={cx("absolute", className)}>
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1, y: [0, -5, 0] }}
            exit={{ opacity: 0 }}
            transition={{
              opacity: { duration: 0.6, delay: 0.6 + index * 0.08 },
              scale: { duration: 0.6, delay: 0.6 + index * 0.08, ease: EASE },
              y: { duration: 5 + index * 0.7, repeat: Infinity, ease: "easeInOut", delay: index * 0.4 },
            }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
