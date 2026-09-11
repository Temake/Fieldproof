"use client";

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useState } from "react";
import { CheckCircle, MinusCircle, PlusCircle } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/lib/cx";
import { COMPATIBILITY } from "@/lib/reference";
import type { ClaimType, EvidenceType } from "@/lib/types";
import { CLAIM_TYPE, EVIDENCE_TYPE } from "@/lib/vocabulary";
import { EVIDENCE_ICON } from "../job/evidence-icon";
import { Reveal } from "../motion/reveal";

const CLAIMS = Object.keys(COMPATIBILITY) as (keyof typeof COMPATIBILITY)[];
const EVIDENCE: EvidenceType[] = ["image", "video", "sensor_reading", "receipt", "pdf", "signature", "voice_note", "checklist"];

type Verdict = "establishes" | "corroborates" | "none";

const VERDICT: Record<Verdict, { label: string; Icon: typeof CheckCircle; tile: string; icon: string }> = {
  establishes: {
    label: "Can prove it",
    Icon: CheckCircle,
    tile: "border-verified-line bg-verified-soft",
    icon: "text-verified",
  },
  corroborates: {
    label: "Adds weight only",
    Icon: PlusCircle,
    tile: "border-dashed border-line-strong bg-surface",
    icon: "text-waiting",
  },
  none: {
    label: "Not evidence for this",
    Icon: MinusCircle,
    tile: "border-line bg-transparent opacity-55",
    icon: "text-faint",
  },
};

function verdictFor(claim: keyof typeof COMPATIBILITY, type: EvidenceType): Verdict {
  const rule = COMPATIBILITY[claim];
  if ((rule.establishes as readonly EvidenceType[]).includes(type)) return "establishes";
  if ((rule.corroborates as readonly EvidenceType[]).includes(type)) return "corroborates";
  return "none";
}

const RANK: Record<Verdict, number> = { establishes: 0, corroborates: 1, none: 2 };

/**
 * PRD 25, the technical heart: a receipt proves three filters were bought,
 * not that three were installed. Choosing a claim re-sorts the evidence so
 * what can prove it rises to the top.
 */
export function Compatibility() {
  const [claim, setClaim] = useState<keyof typeof COMPATIBILITY>("part_installed");
  const tiles = [...EVIDENCE].sort((a, b) => RANK[verdictFor(claim, a)] - RANK[verdictFor(claim, b)]);

  return (
    <section aria-labelledby="compat-title" className="mx-auto max-w-[1240px] px-4 py-24 sm:px-6 lg:py-32">
      <Reveal className="max-w-[44rem]">
        <h2 id="compat-title" className="text-title text-ink">
          <span className="block">A receipt proves a purchase.</span>
          <span className="block text-muted">Not an installation.</span>
        </h2>
        <p className="mt-5 max-w-[60ch] text-lead text-ink-2">
          Every claim is checked against the kind of evidence that can actually prove it. Pick a claim to see what counts.
        </p>
      </Reveal>

      <div className="mt-14 grid grid-cols-1 gap-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-12">
        <Reveal delay={0.1} className="min-w-0">
          <div role="radiogroup" aria-label="Claim" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
            {CLAIMS.map((c) => {
              const selected = c === claim;
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setClaim(c)}
                  className={cx(
                    "relative shrink-0 rounded-control px-4 py-2.5 text-left text-sm font-semibold whitespace-nowrap transition-colors lg:py-3",
                    selected ? "text-on-accent" : "text-ink-2 hover:bg-sunken hover:text-ink",
                  )}
                >
                  {selected && (
                    <motion.span
                      layoutId="compat-claim"
                      aria-hidden
                      className="absolute inset-0 rounded-control bg-accent"
                      transition={{ type: "spring", stiffness: 420, damping: 36 }}
                    />
                  )}
                  <span className="relative">{CLAIM_TYPE[c as ClaimType]}</span>
                </button>
              );
            })}
          </div>
        </Reveal>

        <div>
          <LayoutGroup>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-live="polite">
              {tiles.map((type) => {
                const verdict = verdictFor(claim, type);
                const v = VERDICT[verdict];
                const Icon = EVIDENCE_ICON[type];
                return (
                  <motion.li
                    key={type}
                    layout
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className={cx(
                      "flex min-h-[8.5rem] flex-col justify-between rounded-panel border p-4 transition-[background-color,border-color,opacity] duration-300",
                      v.tile,
                    )}
                  >
                    <Icon aria-hidden className="size-6 text-ink" />
                    <div>
                      <p className="text-sm font-semibold text-ink">{EVIDENCE_TYPE[type].label}</p>
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.p
                          key={verdict}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.2 }}
                          className="mt-1 flex items-center gap-1 text-micro font-semibold text-ink-2"
                        >
                          <v.Icon aria-hidden weight="fill" className={cx("size-3.5", v.icon)} />
                          {v.label}
                        </motion.p>
                      </AnimatePresence>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          </LayoutGroup>
          <p className="mt-5 max-w-[62ch] text-caption text-muted">
            A voice note saying &ldquo;I replaced three filters&rdquo; adds weight to the claim but can never verify it
            alone. Evidence that cannot be read counts as nothing at all.
          </p>
        </div>
      </div>
    </section>
  );
}
