"use client";

import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, Pause, Play } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/lib/cx";
import {
  FINAL_BEAT,
  HERO_BEATS,
  HERO_CHECKS,
  HERO_JOB,
  PHASES,
  type ArtifactId,
  type Phase,
} from "@/lib/hero-job";
import { NATURAL, NoteDoc, PhotoDoc, ReceiptDoc, SignatureDoc, WorkOrderDoc } from "./documents";
import { formation, type DocId } from "./formation";
import { Panel } from "./panel";

const SPRING = { type: "spring", stiffness: 150, damping: 21, mass: 0.9 } as const;
const EASE = [0.16, 1, 0.3, 1] as const;
const DOCS: DocId[] = ["order", "before", "after", "signature", "receipt", "note"];
/** How far into a check beat the check flips to passed. */
const CHECK_PASS_MS = 780;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The hero's product visualization: JOB-2002 replayed as FieldProof processes
 * it. A work order arrives, the technician's evidence lands on the table,
 * each piece is pulled under the lens and checked, the policy decides, and the
 * whole thing collapses into one stamped, closed job.
 *
 * Reduced motion shows the closed job, still.
 */
export function CloseoutEngine() {
  const prefersReduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduce = mounted && Boolean(prefersReduced);

  const root = useRef<HTMLDivElement>(null);
  const inView = useInView(root, { amount: 0.25 });
  const [beat, setBeat] = useState(-1);
  const [checkDone, setCheckDone] = useState(false);
  const [paused, setPaused] = useState(false);
  const [cycle, setCycle] = useState(0);
  const [filing, setFiling] = useState(false);

  useEffect(() => {
    if (reduce || !inView || paused || filing) return;
    const timers: number[] = [];
    if (beat === -1) {
      timers.push(window.setTimeout(() => setBeat(0), cycle === 0 ? 900 : 350));
    } else {
      const b = HERO_BEATS[beat];
      if (b.check !== undefined && !checkDone) timers.push(window.setTimeout(() => setCheckDone(true), CHECK_PASS_MS));
      timers.push(
        window.setTimeout(() => {
          setCheckDone(false);
          if (beat < FINAL_BEAT) setBeat(beat + 1);
          else setFiling(true);
        }, b.ms),
      );
    }
    return () => timers.forEach(window.clearTimeout);
  }, [beat, checkDone, cycle, filing, inView, paused, reduce]);

  // The closed job is filed off the table, then the next run starts clean.
  useEffect(() => {
    if (!filing) return;
    const t = window.setTimeout(() => {
      setFiling(false);
      setBeat(-1);
      setCycle((c) => c + 1);
    }, 650);
    return () => window.clearTimeout(t);
  }, [filing]);

  const current = reduce ? FINAL_BEAT : beat;
  const b = current >= 0 ? HERO_BEATS[current] : null;
  const phase: Phase = b?.phase ?? "field";
  const running = b?.check ?? null;
  const passed = (b?.passed ?? 0) + (running !== null && checkDone ? 1 : 0);
  // A document stays under the lens for its whole check; it is only being
  // read (scan, trace, highlight) until the check passes.
  const lensDoc: DocId | null = running !== null ? HERO_CHECKS[running].inspects : null;
  const scanning = running !== null && !checkDone;

  const verifiedDocs = useMemo(() => {
    const set = new Set<ArtifactId>();
    HERO_CHECKS.slice(0, passed).forEach((c) => c.verifies.forEach((id) => set.add(id)));
    return set;
  }, [passed]);
  const ticked = useMemo(() => {
    const set = new Set<number>();
    HERO_CHECKS.slice(0, passed).forEach((c) => c.ticks.forEach((i) => set.add(i)));
    return set;
  }, [passed]);

  return (
    <figure
      ref={root}
      className="relative overflow-hidden rounded-[20px] border border-line-strong bg-surface shadow-float"
      aria-labelledby="engine-caption"
    >
      <figcaption id="engine-caption" className="sr-only">
        Replay of job {HERO_JOB.jobId}: a work order and five pieces of technician evidence are checked against the
        work order, all five checks pass, and the job closes verified and ready to invoice for $300.00.
      </figcaption>

      <Rail phase={phase} beat={current} closed={phase === "closed"} paused={paused} reduce={reduce} onToggle={() => setPaused((p) => !p)} />

      <div aria-hidden className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,22rem)]">
        <Table
          key={cycle}
          phase={phase}
          arrived={b?.arrived ?? 0}
          idle={current === -1}
          filing={filing}
          lensDoc={lensDoc}
          scanning={scanning}
          passed={passed}
          verifiedDocs={verifiedDocs}
          ticked={phase === "decision" || phase === "closed" ? new Set([0, 1, 2, 3, 4]) : ticked}
          status={b?.status ?? "IN_PROGRESS"}
          reduce={reduce}
        />
        <div className="border-t border-line bg-canvas/40 p-4 sm:p-5 lg:border-t-0 lg:border-l">
          <div className="h-[19.5rem] lg:h-full">
            <Panel
              phase={phase}
              arrived={b?.arrived ?? 0}
              submitted={b?.status === "SUBMITTED"}
              running={running}
              passed={passed}
            />
          </div>
        </div>
      </div>

      <Ticker beat={current} reduce={reduce} />
    </figure>
  );
}

/* -- Workflow rail ------------------------------------------------------- */

function Rail({
  phase,
  beat,
  closed,
  paused,
  reduce,
  onToggle,
}: {
  phase: Phase;
  beat: number;
  closed: boolean;
  paused: boolean;
  reduce: boolean;
  onToggle: () => void;
}) {
  const active = PHASES.findIndex((p) => p.id === phase);
  const started = beat >= 0;

  // Progress through the current phase, filled continuously across its beats.
  const inPhase = HERO_BEATS.map((x, i) => [x, i] as const).filter(([x]) => x.phase === phase);
  const first = inPhase[0]?.[1] ?? 0;
  const fill = started ? (beat - first + 1) / inPhase.length : 0;
  const ms = started ? HERO_BEATS[beat].ms : 0;

  return (
    <div className="flex items-center gap-3 border-b border-line px-3 py-2.5 sm:px-4">
      <div aria-hidden className="flex min-w-0 flex-1 items-center">
        {PHASES.map((p, i) => {
          const done = closed || (started && i < active);
          const current = started && i === active && !closed;
          return (
            <Fragment key={p.id}>
              <span
                className={cx(
                  "flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 text-[12px] font-semibold transition-colors duration-500",
                  current ? "pr-2.5" : "pr-1 md:pr-2.5",
                  current && "bg-accent-soft text-accent-ink",
                  done && (closed ? "text-verified-ink" : "text-ink"),
                  !current && !done && "text-faint",
                )}
              >
                <span
                  className={cx(
                    "grid size-5 place-items-center rounded-full font-mono text-[10px] transition-colors duration-500",
                    done ? (closed ? "bg-verified text-on-verified" : "bg-ink text-canvas") : current ? "bg-accent text-on-accent" : "bg-sunken text-muted",
                  )}
                >
                  {done ? <Check weight="bold" className="size-3" /> : i + 1}
                </span>
                <span className={cx("whitespace-nowrap", !current && "hidden md:inline")}>{p.label}</span>
              </span>
              {i < PHASES.length - 1 && (
                <span className="relative mx-1 h-[2px] min-w-2 flex-1 overflow-hidden rounded-full bg-line md:mx-1.5">
                  <motion.span
                    className={cx("absolute inset-0 origin-left rounded-full", closed ? "bg-verified" : "bg-accent")}
                    initial={false}
                    animate={{ scaleX: done ? 1 : current ? fill : 0 }}
                    transition={current && !reduce ? { duration: ms / 1000, ease: "linear" } : { duration: 0.4, ease: EASE }}
                  />
                </span>
              )}
            </Fragment>
          );
        })}
      </div>
      {!reduce && (
        <button
          type="button"
          onClick={onToggle}
          aria-label={paused ? "Play the replay" : "Pause the replay"}
          className="grid size-8 shrink-0 place-items-center rounded-control border border-line text-ink-2 transition-colors hover:border-line-strong hover:bg-sunken hover:text-ink"
        >
          {paused ? <Play weight="fill" className="size-3.5" /> : <Pause weight="fill" className="size-3.5" />}
        </button>
      )}
    </div>
  );
}

/* -- Evidence table ------------------------------------------------------ */

function Table({
  phase,
  arrived,
  idle,
  filing,
  lensDoc,
  scanning,
  passed,
  verifiedDocs,
  ticked,
  status,
  reduce,
}: {
  phase: Phase;
  arrived: number;
  idle: boolean;
  filing: boolean;
  lensDoc: DocId | null;
  scanning: boolean;
  passed: number;
  verifiedDocs: ReadonlySet<ArtifactId>;
  ticked: ReadonlySet<number>;
  status: (typeof HERO_BEATS)[number]["status"];
  reduce: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pointer parallax: documents drift a little over the grid.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 80, damping: 18 });
  const sy = useSpring(my, { stiffness: 80, damping: 18 });
  const docX = useTransform(sx, (v) => v * 7);
  const docY = useTransform(sy, (v) => v * 5);
  const gridX = useTransform(sx, (v) => v * -4);
  const gridY = useTransform(sy, (v) => v * -3);

  const f = useMemo(
    () => (size.w ? formation({ w: size.w, h: size.h, phase, arrived, inspecting: lensDoc, idle }) : null),
    [size.w, size.h, phase, arrived, lensDoc, idle],
  );

  // A pulse through the grid for every passed check, and a bigger one for the stamp.
  const [pulses, setPulses] = useState<{ id: number; x: number; y: number; big: boolean }[]>([]);
  const lastPassed = useRef(passed);
  const focus = f?.focus;
  useEffect(() => {
    if (reduce || !focus) return;
    if (passed > lastPassed.current) {
      setPulses((p) => [...p, { id: Date.now(), x: focus.x, y: focus.y, big: false }]);
    }
    lastPassed.current = passed;
    // focus is read at the moment a check passes; it is not a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passed, reduce]);
  const stamped = phase === "closed";
  useEffect(() => {
    if (reduce || !stamped || !focus) return;
    const t = window.setTimeout(() => setPulses((p) => [...p, { id: Date.now(), x: focus.x, y: focus.y, big: true }]), 620);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamped, reduce]);

  return (
    <div
      ref={ref}
      className="relative h-[24rem] overflow-hidden bg-canvas sm:h-[26rem] lg:h-[clamp(22rem,calc(100dvh-25.5rem),32rem)]"
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        mx.set(((e.clientX - r.left) / r.width - 0.5) * 2);
        my.set(((e.clientY - r.top) / r.height - 0.5) * 2);
      }}
      onPointerLeave={() => {
        mx.set(0);
        my.set(0);
      }}
    >
      <motion.div aria-hidden className="table-grid absolute -inset-6" style={{ x: gridX, y: gridY }} />
      {pulses.map((p) => (
        <GridPulse
          key={p.id}
          x={p.x}
          y={p.y}
          big={p.big}
          onDone={() => setPulses((all) => all.filter((q) => q.id !== p.id))}
        />
      ))}

      {f && (
        <motion.div className="absolute inset-0" style={{ x: docX, y: docY }}>
          <AnimatePresence>
            {f.slots.map(({ id, rect }) => (
              <motion.div
                key={`slot-${id}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                transition={{ duration: 0.4 }}
                className="absolute grid place-items-center rounded-[10px] border-[1.5px] border-dashed border-line-strong bg-surface/40"
                style={{
                  left: rect.cx - rect.w / 2,
                  top: rect.cy - rect.h / 2,
                  width: rect.w,
                  height: rect.h,
                  rotate: rect.rotate,
                }}
              >
                {rect.w > 70 && (
                  <span className="px-2 text-center font-mono text-[10px] font-semibold tracking-[0.06em] text-faint uppercase">
                    {id === "note" ? "Tech note" : id === "signature" ? "Signature" : id === "receipt" ? "Receipt" : id}
                  </span>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {DOCS.map((id) => {
            const p = f.poses[id];
            const [w, h] = NATURAL[id];
            const out = filing ? { x: p.x + size.w * 0.7, rotate: p.rotate + 6, opacity: 0 } : null;
            return (
              <motion.div
                key={id}
                className="absolute top-0 left-0 will-change-transform"
                style={{ width: w, height: h, zIndex: p.zIndex }}
                initial={reduce ? false : { x: p.x, y: p.y, scale: p.scale, rotate: p.rotate, opacity: p.opacity }}
                animate={{ x: p.x, y: p.y, scale: p.scale, rotate: p.rotate, opacity: p.opacity, ...out }}
                transition={
                  reduce
                    ? { duration: 0 }
                    : {
                        ...SPRING,
                        opacity: { duration: 0.3 },
                        ...(filing ? { x: { duration: 0.55, ease: [0.7, 0, 0.84, 0] } } : null),
                      }
                }
              >
                <Doc
                  id={id}
                  inspecting={scanning && lensDoc === id}
                  verified={id !== "order" && verifiedDocs.has(id)}
                  status={status}
                  ticked={ticked}
                  sweeping={scanning && lensDoc === "order"}
                  stamped={stamped}
                />
              </motion.div>
            );
          })}
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {lensDoc && f && (
          <motion.span
            key={`lens-${lensDoc}-${scanning}`}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6, transition: { duration: 0.12 } }}
            transition={{ duration: 0.22, ease: EASE }}
            style={{ left: f.focus.x }}
            className={cx(
              "absolute top-3 z-[60] -ml-[5.5rem] flex w-44 items-center justify-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10.5px] font-semibold whitespace-nowrap",
              scanning ? "bg-ink text-canvas" : "bg-verified text-on-verified",
            )}
          >
            {scanning ? <span className="live-dot text-accent" /> : <Check weight="bold" className="size-3" />}
            {scanning ? "reading" : "verified"} {NAMES[lensDoc]}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

const NAMES: Record<DocId, string> = {
  order: "work order",
  before: "before-photo.jpg",
  after: "after-photo.jpg",
  signature: "signature.png",
  receipt: "receipt.pdf",
  note: "tech-note.m4a",
};

function Doc({
  id,
  inspecting,
  verified,
  status,
  ticked,
  sweeping,
  stamped,
}: {
  id: DocId;
  inspecting: boolean;
  verified: boolean;
  status: (typeof HERO_BEATS)[number]["status"];
  ticked: ReadonlySet<number>;
  sweeping: boolean;
  stamped: boolean;
}) {
  switch (id) {
    case "order":
      return <WorkOrderDoc status={status} ticked={ticked} sweeping={sweeping} stamped={stamped} />;
    case "before":
    case "after":
      return <PhotoDoc id={id} inspecting={inspecting} verified={verified} />;
    case "signature":
      return <SignatureDoc inspecting={inspecting} verified={verified} />;
    case "receipt":
      return <ReceiptDoc inspecting={inspecting} verified={verified} />;
    case "note":
      return <NoteDoc inspecting={inspecting} verified={verified} />;
  }
}

/**
 * Inspired by DataGridHero: the table's grid lights up in a ring that
 * travels outward from wherever a check just passed.
 */
function GridPulse({ x, y, big, onDone }: { x: number; y: number; big: boolean; onDone: () => void }) {
  const r = useMotionValue(0);
  const mask = useMotionTemplate`radial-gradient(circle at ${x}px ${y}px, transparent calc(${r}px - 90px), black calc(${r}px - 30px), transparent ${r}px)`;
  useEffect(() => {
    const controls = animate(r, big ? 1100 : 620, { duration: big ? 1.5 : 1.05, ease: [0.25, 0.8, 0.4, 1], onComplete: onDone });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <motion.div
      aria-hidden
      className="table-grid-lit absolute inset-0"
      style={{ maskImage: mask, WebkitMaskImage: mask }}
      initial={{ opacity: big ? 0.9 : 0.7 }}
      animate={{ opacity: 0 }}
      transition={{ duration: big ? 1.5 : 1.05, ease: "easeIn" }}
    />
  );
}

/* -- Event log ----------------------------------------------------------- */

function Ticker({ beat, reduce }: { beat: number; reduce: boolean }) {
  const b = beat >= 0 ? HERO_BEATS[beat] : null;
  return (
    <div
      aria-hidden
      className="flex items-center gap-4 border-t border-line bg-canvas/40 px-4 py-2 font-mono text-[11px] text-muted"
    >
      <div className="relative h-4 min-w-0 flex-1 overflow-hidden">
        <AnimatePresence initial={false} mode="wait">
          <motion.p
            key={beat}
            initial={reduce ? false : { y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.24, ease: EASE }}
            className="absolute inset-0 truncate"
          >
            {b ? (
              <>
                <span className="text-faint tabular">{String(beat + 1).padStart(2, "0")}</span>
                <span className="mx-2 font-semibold text-ink-2">{b.event}</span>
                <span>{b.subject}</span>
              </>
            ) : (
              <span className="text-faint">waiting for the next completed job…</span>
            )}
          </motion.p>
        </AnimatePresence>
      </div>
      <span className="hidden shrink-0 text-faint sm:inline">Replay of a real run · {HERO_JOB.jobId}</span>
    </div>
  );
}
