"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Camera, Check, Microphone, Receipt, SealCheck, Signature } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/lib/cx";
import { HERO_ARTIFACTS, HERO_CHECKS, HERO_JOB, HERO_POLICY, type ArtifactId, type Phase } from "@/lib/hero-job";

const EASE = [0.16, 1, 0.3, 1] as const;

const ICON: Record<ArtifactId, typeof Camera> = {
  before: Camera,
  after: Camera,
  signature: Signature,
  receipt: Receipt,
  note: Microphone,
};

export interface PanelState {
  phase: Phase;
  arrived: number;
  submitted: boolean;
  running: number | null;
  passed: number;
}

/** The system's side of the stage: what FieldProof is reading and deciding. */
export function Panel(state: PanelState) {
  const mode = state.phase === "field" ? "evidence" : state.phase;
  return (
    <div className="relative h-full overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 14, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -10, filter: "blur(4px)", transition: { duration: 0.22 } }}
          transition={{ duration: 0.45, ease: EASE }}
          className="flex h-full flex-col"
        >
          {mode === "evidence" && <Intake {...state} />}
          {mode === "verify" && <Checks {...state} />}
          {mode === "decision" && <Decision />}
          {mode === "closed" && <Outcome />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Heading({ title, count }: { title: string; count?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <p className="text-caption font-semibold text-ink">{title}</p>
      {count && <p className="font-mono text-micro text-muted tabular">{count}</p>}
    </div>
  );
}

function Intake({ arrived, submitted }: PanelState) {
  return (
    <>
      <Heading title="Evidence intake" count={`${arrived}/${HERO_ARTIFACTS.length} received`} />
      <ul className="divide-y divide-line">
        {HERO_ARTIFACTS.map((a, i) => {
          const Icon = ICON[a.id];
          const got = i < arrived;
          return (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <span
                className={cx(
                  "grid size-7 shrink-0 place-items-center rounded-full border transition-colors duration-300",
                  got ? "border-accent-line bg-accent-soft text-accent-ink" : "border-dashed border-line-strong text-faint",
                )}
              >
                <Icon className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={cx("text-caption leading-tight font-medium", got ? "text-ink" : "text-muted")}>{a.label}</p>
                <p className="truncate font-mono text-[11px] text-faint">{got ? a.filename : "expected"}</p>
              </div>
              <AnimatePresence>
                {got && (
                  <motion.span
                    initial={{ opacity: 0, x: 6 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="font-mono text-[11px] font-semibold text-accent-ink"
                  >
                    received
                  </motion.span>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto flex items-center gap-2 border-t border-line pt-3 text-micro text-muted">
        <span className={cx("live-dot", submitted ? "text-accent" : "text-waiting")} />
        {submitted ? `${HERO_JOB.technician} marked the job complete` : `${HERO_JOB.technician} is on site`}
      </div>
    </>
  );
}

function Checks({ running, passed }: PanelState) {
  return (
    <>
      <Heading title="Verifying against the work order" count={`${passed}/${HERO_CHECKS.length}`} />
      <ol className="space-y-1">
        {HERO_CHECKS.map((c, i) => {
          const done = i < passed;
          const active = running === i && !done;
          return (
            <li
              key={c.label}
              className={cx(
                "relative overflow-hidden rounded-control px-2.5 py-2 transition-colors duration-300",
                active && "bg-accent-soft/70",
              )}
            >
              <div className="flex items-start gap-2.5">
                <StatusDot done={done} active={active} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={cx("text-caption leading-tight font-semibold", done || active ? "text-ink" : "text-muted")}>
                      {c.label}
                    </p>
                    {done && c.confidence && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="font-mono text-[11px] text-verified-ink tabular"
                      >
                        {c.confidence.toFixed(2)}
                      </motion.span>
                    )}
                  </div>
                  <AnimatePresence initial={false}>
                    {(done || active) && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        transition={{ duration: 0.3, ease: EASE }}
                        className="text-[11.5px] leading-snug text-muted"
                      >
                        {active ? "Reading evidence…" : c.detail}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              {active && (
                <motion.span
                  aria-hidden
                  className="absolute bottom-0 left-0 h-[2px] w-full origin-left bg-accent"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.75, ease: "linear" }}
                />
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

function StatusDot({ done, active }: { done: boolean; active: boolean }) {
  return (
    <span className="relative mt-px grid size-[18px] shrink-0 place-items-center">
      <AnimatePresence initial={false} mode="popLayout">
        {done ? (
          <motion.span
            key="done"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 600, damping: 22 }}
            className="grid size-[18px] place-items-center rounded-full bg-verified text-on-verified"
          >
            <Check weight="bold" className="size-3" />
          </motion.span>
        ) : active ? (
          <motion.span
            key="active"
            className="size-[18px] rounded-full border-2 border-accent-line border-t-accent"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.7, ease: "linear", repeat: Infinity }}
          />
        ) : (
          <span key="idle" className="size-[14px] rounded-full border-[1.5px] border-line-strong" />
        )}
      </AnimatePresence>
    </span>
  );
}

function Decision() {
  return (
    <>
      <div className="mb-3 flex items-center gap-2 rounded-control bg-verified-soft px-2.5 py-2 text-caption font-semibold text-verified-ink">
        <SealCheck weight="fill" className="size-4" />
        {HERO_CHECKS.length} of {HERO_CHECKS.length} checks passed
      </div>
      <p className="mb-1.5 text-caption font-semibold text-ink">Close-out policy</p>
      <ul className="divide-y divide-line">
        {HERO_POLICY.map((row, i) => (
          <motion.li
            key={row.label}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.22, duration: 0.35, ease: EASE }}
            className="flex items-center justify-between gap-3 py-2 text-caption"
          >
            <span className="text-ink-2">{row.label}</span>
            <span className="flex items-center gap-1.5 font-mono text-[12px] font-semibold text-ink tabular">
              {row.value}
              <Check weight="bold" className="size-3.5 text-verified" />
            </span>
          </motion.li>
        ))}
      </ul>
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1.0, duration: 0.5, ease: EASE }}
        className="mt-auto rounded-panel border border-accent-line bg-accent-soft/60 p-3"
      >
        <p className="font-mono text-[10.5px] font-semibold tracking-[0.12em] text-accent-ink">DECISION</p>
        <p className="mt-0.5 text-subheading text-ink">Close automatically</p>
        <p className="text-micro text-muted">Inside authorization, nothing blocking. No one needs to look.</p>
      </motion.div>
    </>
  );
}

const OUTCOME = ["Verified", "Job closed", "Ready to invoice"];

function Outcome() {
  return (
    <div className="flex h-full flex-col">
      <ul className="space-y-3 pt-1">
        {OUTCOME.map((line, i) => (
          <motion.li
            key={line}
            initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ delay: 0.3 + i * 0.3, duration: 0.55, ease: EASE }}
            className={cx(
              "flex items-center gap-3 font-mono leading-none font-bold tracking-[0.01em] uppercase",
              i === 0 ? "text-[2.5rem] text-verified" : "text-[1.65rem] text-ink",
            )}
          >
            {i === 0 && (
              <motion.span
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.3, type: "spring", stiffness: 520, damping: 18 }}
                className="grid size-10 shrink-0 place-items-center rounded-full bg-verified text-on-verified"
              >
                <Check weight="bold" className="size-6" />
              </motion.span>
            )}
            {line}
          </motion.li>
        ))}
      </ul>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
        className="mt-auto space-y-2 border-t border-line pt-3"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-caption text-muted">Invoice amount</span>
          <span className="font-mono text-[1.35rem] font-bold text-ink tabular">$300.00</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-caption">
          <span className="text-muted">Evidence receipt</span>
          <span className="font-mono font-semibold text-ink">{HERO_JOB.receiptId}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-caption">
          <span className="text-muted">People involved</span>
          <span className="font-mono font-semibold text-ink tabular">
            {HERO_JOB.people} · {HERO_JOB.steps}/{HERO_JOB.steps} steps autonomous
          </span>
        </div>
      </motion.div>
    </div>
  );
}
