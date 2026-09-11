"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Check, Microphone, Receipt, Signature } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/lib/cx";
import { HERO_JOB, HERO_REQUIREMENTS, type ArtifactId } from "@/lib/hero-job";
import type { JobStatus } from "@/lib/types";
import { StatusPill } from "../../StatusPill";

/**
 * The physical things on the evidence table. Each renders at a fixed natural
 * size and is only ever moved with transforms (x, y, scale, rotate), so a
 * document can travel from the intake spread to the inspection spot to the
 * closed bundle without re-laying out its text.
 */
export const NATURAL: Record<ArtifactId | "order", readonly [number, number]> = {
  order: [256, 368],
  before: [208, 172],
  after: [208, 172],
  signature: [208, 112],
  receipt: [150, 216],
  note: [224, 104],
};

const PAPER =
  "bg-surface border border-line shadow-[0_1px_1px_rgb(var(--shadow-rgb)/0.07),0_12px_28px_-14px_rgb(var(--shadow-rgb)/0.38)]";
const EASE = [0.16, 1, 0.3, 1] as const;

export interface DocState {
  /** Under the inspection lens right now. */
  inspecting?: boolean;
  /** A check citing this artifact has passed. */
  verified?: boolean;
}

function VerifiedBadge({ show }: { show?: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.span
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          exit={{ scale: 0 }}
          transition={{ type: "spring", stiffness: 520, damping: 24 }}
          className="absolute -top-2.5 -right-2.5 z-10 grid size-7 place-items-center rounded-full bg-verified text-on-verified ring-4 ring-surface"
        >
          <Check weight="bold" className="size-4" />
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function Caption({ icon, filename, tag }: { icon: React.ReactNode; filename: string; tag?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 px-1 font-mono text-[10px] leading-none text-muted">
      <span className="flex min-w-0 items-center gap-1.5 truncate">
        {icon}
        {filename}
      </span>
      {tag && <span className="font-semibold tracking-[0.08em] text-ink-2">{tag}</span>}
    </div>
  );
}

/** A soft accent band sweeping down the frame: the model reading the image. */
function ScanSweep() {
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 h-10 bg-gradient-to-b from-transparent via-accent/30 to-transparent"
      initial={{ top: "-25%" }}
      animate={{ top: "105%" }}
      transition={{ duration: 0.9, ease: "easeInOut", repeat: 1, repeatDelay: 0.05 }}
    />
  );
}

function Finding({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, duration: 0.35, ease: EASE }}
      className={cx(
        "absolute z-[2] rounded-[4px] bg-ink/85 px-1.5 py-1 font-mono text-[8.5px] leading-none font-semibold text-canvas backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </motion.span>
  );
}

export function PhotoDoc({ id, inspecting, verified }: DocState & { id: "before" | "after" }) {
  const before = id === "before";
  return (
    <div className={cx("relative flex h-full w-full flex-col gap-2 rounded-[10px] p-1.5 pb-2", PAPER)}>
      <VerifiedBadge show={verified} />
      <div className="relative flex-1 overflow-hidden rounded-[6px] bg-sunken">
        <Image
          src={before ? "/hero/before-photo.jpg" : "/hero/after-photo.jpg"}
          alt=""
          fill
          sizes="420px"
          priority={before}
          className={cx("object-cover", before ? "object-[18%_50%]" : "object-[40%_38%]")}
        />
        <AnimatePresence>
          {inspecting && (
            <motion.span key="lens" className="absolute inset-0" exit={{ opacity: 0 }}>
              <ScanSweep />
              {before ? (
                <>
                  <motion.span
                    initial={{ opacity: 0, scale: 1.25 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2, duration: 0.4, ease: EASE }}
                    className="absolute top-[34%] left-[6%] h-[34%] w-[20%] rounded-[3px] border-[1.5px] border-accent"
                  />
                  <Finding className="top-[72%] left-[6%]">RTU · 1400 Harbour Way</Finding>
                </>
              ) : (
                <>
                  <motion.span
                    initial={{ opacity: 0, scale: 1.25 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2, duration: 0.4, ease: EASE }}
                    className="absolute top-[10%] left-[4%] h-[62%] w-[34%] rounded-[3px] border-[1.5px] border-accent"
                  />
                  <Finding className="top-[76%] left-[4%]">
                    {HERO_JOB.part} × {HERO_JOB.quantity} · 0.96
                  </Finding>
                </>
              )}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <Caption
        icon={<Camera className="size-3" />}
        filename={before ? "before-photo.jpg" : "after-photo.jpg"}
        tag={before ? "BEFORE" : "AFTER"}
      />
    </div>
  );
}

// An abstract hand-signed stroke; drawn once on arrival, traced again when checked.
const SIGNATURE_PATH =
  "M10 58 C 16 34, 20 22, 24 40 S 29 62, 34 36 S 42 16, 46 44 C 48 56, 55 52, 60 40 C 64 31, 72 31, 70 43 C 68 53, 60 53, 64 45 C 70 35, 82 37, 86 45 C 90 53, 98 35, 106 39 C 112 42, 110 51, 118 47 C 126 43, 130 31, 136 37 C 142 43, 138 53, 148 47 C 158 41, 168 39, 184 42 M 22 66 C 64 61, 124 59, 192 54";

export function SignatureDoc({ inspecting, verified }: DocState) {
  return (
    <div className={cx("relative flex h-full w-full flex-col justify-between rounded-[10px] px-3 pt-2.5 pb-2", PAPER)}>
      <VerifiedBadge show={verified} />
      <p className="font-mono text-[9px] font-semibold tracking-[0.1em] text-faint">CUSTOMER SIGNATURE</p>
      <svg viewBox="0 0 200 72" className="absolute inset-x-2 top-5 h-[64px] w-[calc(100%-1rem)] overflow-visible" aria-hidden>
        <motion.path
          d={SIGNATURE_PATH}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: "easeInOut", delay: 0.15 }}
        />
        {inspecting && (
          <motion.path
            d={SIGNATURE_PATH}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0.9 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.8, ease: "easeInOut", delay: 0.1 }}
          />
        )}
      </svg>
      <div className="relative">
        <div className="mb-1 h-px bg-line-strong" />
        <Caption icon={<Signature className="size-3" />} filename="signature.png" tag={HERO_JOB.customer.toUpperCase()} />
      </div>
    </div>
  );
}

export function ReceiptDoc({ inspecting, verified }: DocState) {
  const row = "flex justify-between gap-2";
  return (
    <div className="relative h-full w-full drop-shadow-[0_10px_14px_rgb(var(--shadow-rgb)/0.2)]">
      <VerifiedBadge show={verified} />
      <div className="receipt-edge h-full w-full bg-surface px-3 pt-3 pb-5 font-mono text-[9.5px] leading-[1.45] text-ink-2">
        <p className="text-center text-[11px] font-bold tracking-[0.18em] text-ink">SUPPLYCO</p>
        <p className="text-center text-[8.5px] text-faint">TRADE COUNTER · CARD</p>
        <div className="my-2 border-t border-dashed border-line-strong" />
        <p className="text-ink">Air Filter A</p>
        <div className="relative -mx-1 px-1">
          {inspecting && (
            <motion.span
              aria-hidden
              className="absolute inset-0 origin-left rounded-[2px] bg-accent/20"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.25, duration: 0.45, ease: EASE }}
            />
          )}
          <div className={cx(row, "relative")}>
            <span>2 × {HERO_JOB.part}</span>
          </div>
          <div className={cx(row, "relative")}>
            <span>@ 54.00</span>
            <span>108.00</span>
          </div>
        </div>
        <div className="my-2 border-t border-dashed border-line-strong" />
        <div className={cx(row, "font-bold text-ink")}>
          <span>TOTAL</span>
          <span>108.00</span>
        </div>
        <div className={row}>
          <span>PAID</span>
          <span>CARD</span>
        </div>
        <p className="mt-2.5 flex items-center gap-1 text-[8.5px] text-faint">
          <Receipt className="size-3" /> receipt.pdf
        </p>
      </div>
    </div>
  );
}

// Fixed bar heights so the waveform is identical on server and client.
const WAVE = [4, 7, 11, 6, 14, 18, 9, 12, 20, 15, 8, 5, 10, 16, 22, 13, 7, 11, 17, 9, 6, 12, 19, 14, 8, 5, 9, 13, 7, 4];

export function NoteDoc({ inspecting, verified }: DocState) {
  return (
    <div className={cx("relative flex h-full w-full flex-col justify-between rounded-[10px] px-3 py-2.5", PAPER)}>
      <VerifiedBadge show={verified} />
      <div className="flex items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-canvas">
          <Microphone weight="fill" className="size-3.5" />
        </span>
        <div className="flex h-6 flex-1 items-center gap-[2px]" aria-hidden>
          {WAVE.map((h, i) => (
            <span
              key={i}
              className={cx("w-[3px] rounded-full transition-colors duration-500", inspecting ? "bg-accent" : "bg-line-strong")}
              style={{ height: h }}
            />
          ))}
        </div>
      </div>
      <p className="text-[10.5px] leading-snug text-ink">&ldquo;Replaced both filters. Unit running normally.&rdquo;</p>
      <Caption icon={<Microphone className="size-3" />} filename="tech-note.m4a" tag="DANIEL" />
    </div>
  );
}

export function WorkOrderDoc({
  status,
  ticked,
  sweeping,
  stamped,
}: {
  status: JobStatus;
  ticked: ReadonlySet<number>;
  /** "Evidence complete": the requirement list is being read top to bottom. */
  sweeping?: boolean;
  stamped?: boolean;
}) {
  return (
    <div className={cx("relative flex h-full w-full flex-col overflow-hidden rounded-[12px]", PAPER)}>
      <div className="flex items-start justify-between gap-2 border-b border-line bg-sunken/60 px-3.5 pt-3 pb-2.5">
        <div>
          <p className="font-mono text-[9px] font-semibold tracking-[0.14em] text-faint">WORK ORDER</p>
          <p className="mt-0.5 font-mono text-[15px] font-bold tracking-tight text-ink">{HERO_JOB.jobId}</p>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={status}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
          >
            <StatusPill kind="job" status={status} size="sm" />
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="px-3.5 pt-2.5">
        <p className="text-[12.5px] leading-tight font-semibold text-ink">{HERO_JOB.scope}</p>
        <p className="text-[11px] text-muted">{HERO_JOB.asset}</p>
        <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] leading-tight">
          {[
            ["Site", HERO_JOB.site],
            ["Customer", HERO_JOB.customer],
            ["Technician", HERO_JOB.technician],
            ["Authorized", "$300.00"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-faint">{k}</dt>
              <dd className="font-medium text-ink-2 tabular">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="relative mt-3 flex-1 border-t border-dashed border-line px-3.5 pt-2">
        <p className="font-mono text-[8.5px] font-semibold tracking-[0.14em] text-faint">REQUIRED</p>
        {sweeping && (
          <motion.span
            aria-hidden
            className="absolute inset-x-2 h-5 rounded-[4px] bg-accent/15"
            initial={{ top: 18 }}
            animate={{ top: 18 + 4 * 19 }}
            transition={{ duration: 0.75, ease: "easeInOut" }}
          />
        )}
        <ul className="relative mt-1 space-y-[5px]">
          {HERO_REQUIREMENTS.map((req, i) => {
            const done = ticked.has(i);
            return (
              <li key={req} className="flex items-center gap-2 text-[10.5px] leading-[14px]">
                <span
                  className={cx(
                    "grid size-3.5 shrink-0 place-items-center rounded-[3px] border transition-colors duration-300",
                    done ? "border-verified bg-verified text-on-verified" : "border-line-strong bg-surface",
                  )}
                >
                  {done && <Check weight="bold" className="size-2.5" />}
                </span>
                <span className={cx("transition-colors duration-300", done ? "text-ink" : "text-muted")}>{req}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <AnimatePresence>
        {stamped && (
          <motion.div
            key="stamp"
            initial={{ opacity: 0, scale: 2.4, rotate: -4 }}
            animate={{ opacity: 1, scale: 1, rotate: -11 }}
            transition={{ type: "spring", stiffness: 520, damping: 26, mass: 1.1 }}
            className="stamp absolute right-3 bottom-3 rounded-[6px] border-[3px] border-verified px-2.5 pt-1 pb-1.5 text-center text-verified"
          >
            <p className="font-mono text-[19px] leading-none font-black tracking-[0.12em]">VERIFIED</p>
            <p className="mt-1 font-mono text-[8px] font-bold tracking-[0.16em]">JOB CLOSED · {HERO_JOB.receiptId}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
