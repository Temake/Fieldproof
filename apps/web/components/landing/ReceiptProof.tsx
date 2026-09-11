"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useMemo, useState } from "react";
import { ArrowCounterClockwise, SealCheck, SealWarning } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/lib/cx";
import { REFERENCE } from "@/lib/reference";
import { Reveal } from "../motion/reveal";

/**
 * PRD 29 in the browser: the same canonical form the API hashes
 * (sorted keys, no whitespace), digested with Web Crypto. Editing the amount
 * shows why a sealed receipt cannot be quietly changed.
 */

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Web Crypto exists only in secure contexts (HTTPS or localhost). */
async function sha256(text: string): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function receiptBody(finalAmount: number) {
  return {
    receipt_id: REFERENCE.receiptId,
    job_id: REFERENCE.jobId,
    result: "CLOSED",
    requirements: { total: 5, verified: 5 },
    decisions: [{ decision: "APPROVE", decided_by: REFERENCE.supervisor, policy: REFERENCE.policy }],
    final_amount: finalAmount,
  };
}

export function ReceiptProof() {
  const inputId = useId();
  const [amount, setAmount] = useState(String(REFERENCE.final.toFixed(2)));
  const [sealed, setSealed] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  const parsed = Number(amount);
  const value = Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : REFERENCE.final;
  const body = useMemo(() => receiptBody(value), [value]);

  useEffect(() => {
    void sha256(canonical(receiptBody(REFERENCE.final))).then((h) => (h ? setSealed(h) : setUnsupported(true)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void sha256(canonical(body)).then((h) => !cancelled && setCurrent(h));
    return () => {
      cancelled = true;
    };
  }, [body]);

  const matches = sealed !== null && current === sealed;
  const edited = value !== REFERENCE.final;

  return (
    <section id="receipt" aria-labelledby="receipt-title" className="scroll-mt-20 border-y border-line bg-surface">
      <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-20 lg:py-32">
        <Reveal>
          <h2 id="receipt-title" className="text-title text-ink">
            The receipt proves itself.
          </h2>
          <p className="mt-5 max-w-[52ch] text-lead text-ink-2">
            At close, FieldProof seals a receipt of every requirement, claim, conflict and decision with a SHA-256 hash of its
            canonical form. Change anything and the hash stops matching.
          </p>
          <div className="mt-8 max-w-sm">
            <label htmlFor={inputId} className="text-sm font-semibold text-ink">
              Try changing the final amount
            </label>
            <div className="mt-2 flex gap-2">
              <div className="relative flex-1">
                <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">
                  $
                </span>
                <input
                  id={inputId}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-11 w-full rounded-control border border-line-strong bg-canvas pr-3 pl-7 font-mono text-sm text-ink transition-[border-color,box-shadow] focus:border-accent focus:ring-3 focus:ring-accent/20 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setAmount(REFERENCE.final.toFixed(2))}
                disabled={!edited}
                aria-label="Reset the amount"
                className="grid size-11 place-items-center rounded-control border border-line-strong text-ink-2 transition-colors hover:bg-sunken disabled:opacity-40"
              >
                <ArrowCounterClockwise aria-hidden className="size-4" />
              </button>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="rounded-panel border border-line bg-canvas p-6 shadow-float sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-caption font-semibold text-muted">Evidence receipt</p>
                <p className="mt-1 font-mono text-2xl font-bold text-ink">{REFERENCE.receiptId}</p>
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={matches ? "ok" : "bad"}
                  initial={{ opacity: 0, scale: 0.85, rotate: -8 }}
                  animate={{ opacity: 1, scale: 1, rotate: -3 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 400, damping: 24 }}
                  className={cx(
                    "flex items-center gap-1.5 rounded-control border-2 px-3 py-1.5 text-micro font-bold tracking-[0.1em] uppercase",
                    matches ? "border-verified text-verified" : "border-blocking text-blocking",
                  )}
                >
                  {matches ? <SealCheck aria-hidden weight="fill" className="size-4" /> : <SealWarning aria-hidden weight="fill" className="size-4" />}
                  {matches ? "Sealed" : "Altered"}
                </motion.span>
              </AnimatePresence>
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line py-5 text-sm">
              <div>
                <dt className="text-micro text-muted">Job</dt>
                <dd className="mt-0.5 font-mono font-semibold text-ink">{REFERENCE.jobId}</dd>
              </div>
              <div>
                <dt className="text-micro text-muted">Result</dt>
                <dd className="mt-0.5 font-semibold text-ink">Closed</dd>
              </div>
              <div>
                <dt className="text-micro text-muted">Requirements</dt>
                <dd className="mt-0.5 font-semibold text-ink">5/5 verified</dd>
              </div>
              <div>
                <dt className="text-micro text-muted">Decision</dt>
                <dd className="mt-0.5 font-semibold text-ink">Approved by {REFERENCE.supervisor}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-micro text-muted">Final amount</dt>
                <dd className={cx("mt-0.5 font-mono text-lg font-bold transition-colors", edited ? "text-blocking-ink" : "text-ink")}>
                  ${value.toFixed(2)}
                </dd>
              </div>
            </dl>

            <div className="mt-5" aria-live="polite">
              <p className="text-micro font-semibold text-muted">SHA-256, recomputed as you type</p>
              <HashView value={current} reference={sealed} />
              <p className={cx("mt-3 text-caption font-medium", matches ? "text-verified-ink" : "text-blocking-ink")}>
                {unsupported
                  ? "Hashing needs a secure connection (HTTPS or localhost)."
                  : sealed === null || current === null
                  ? "Computing."
                  : matches
                    ? "Matches the sealed hash."
                    : "No longer matches the sealed hash. The change is evident."}
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/** Characters that differ from the sealed hash are highlighted: one edit changes almost all of them. */
function HashView({ value, reference }: { value: string | null; reference: string | null }) {
  if (!value) return <p className="mt-2 h-10 font-mono text-micro text-muted">...</p>;
  return (
    <p className="mt-2 font-mono text-[0.8125rem] leading-relaxed break-all" aria-label={`Hash ${value}`}>
      {value.split("").map((ch, i) => {
        const differs = reference !== null && reference[i] !== ch;
        return (
          <span key={i} aria-hidden className={cx("transition-colors duration-300", differs ? "text-blocking" : "text-ink-2")}>
            {ch}
          </span>
        );
      })}
    </p>
  );
}
