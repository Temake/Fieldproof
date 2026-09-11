"use client";

import { motion } from "framer-motion";
import { Camera, ChatText, Check, Gavel, ShieldCheck, X } from "@phosphor-icons/react/dist/ssr";
import { money, signedMoney } from "@/lib/format";
import { REFERENCE } from "@/lib/reference";
import { Reveal, RevealGroup, RevealItem } from "../motion/reveal";

const POINTS = [
  {
    Icon: ChatText,
    title: "It tried everything else first.",
    body: `Before escalating, FieldProof asked ${REFERENCE.technician} for a photo of the third filter. He sent it, and the evidence question disappeared.`,
  },
  {
    Icon: ShieldCheck,
    title: "Policy made it a question, not the model.",
    body: `${REFERENCE.policyId}: parts installed outside the approved scope need a supervisor. This job's allowance was ${money(REFERENCE.allowance)}.`,
  },
  {
    Icon: Gavel,
    title: "The whole case is on one card.",
    body: "The quantities, the money, the photo that proves it, the rule, and a recommendation. Nothing else to open.",
  },
];

/** PRD 12 scene 6: "Only now does the human become involved." */
export function DecisionMoment() {
  return (
    <section id="decision" aria-labelledby="decision-title" className="mx-auto max-w-[1240px] scroll-mt-20 px-4 py-24 sm:px-6 lg:py-32">
      <Reveal className="max-w-[44rem]">
        <h2 id="decision-title" className="text-title text-ink">
          One question, and only when it matters.
        </h2>
        <p className="mt-5 max-w-[60ch] text-lead text-ink-2">
          FieldProof recovers what it can on its own. A supervisor hears about a job only when the rules say a person must
          decide.
        </p>
      </Reveal>

      <div className="mt-14 grid items-center gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16">
        <motion.figure
          initial={{ opacity: 0, y: 32, rotate: -1.2 }}
          whileInView={{ opacity: 1, y: 0, rotate: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden rounded-panel border border-line bg-surface shadow-float"
          aria-label={`The decision card for ${REFERENCE.jobId}`}
        >
          <div className="flex items-center justify-between border-b border-blocking-line bg-blocking-soft/70 px-6 py-3.5">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
              <Gavel aria-hidden weight="fill" className="size-5 text-blocking" /> Decision required
            </span>
            <span className="font-mono text-micro font-semibold text-accent-ink">{REFERENCE.jobId}</span>
          </div>
          <div className="space-y-5 p-6">
            <p className="text-subheading text-balance text-ink">{REFERENCE.question}</p>
            <div className="grid grid-cols-3 gap-2.5">
              <Tile label="Authorized" value={String(REFERENCE.expected)} />
              <Tile label="Verified" value={String(REFERENCE.observed)} emphasis />
              <Tile label="Additional" value={signedMoney(REFERENCE.impact)} />
            </div>
            <div className="flex items-center gap-3 rounded-control border border-verified-line bg-verified-soft/50 px-3 py-2.5">
              <Camera aria-hidden className="size-4 text-ink-2" />
              <p className="text-caption text-ink">
                Part installed × 3 <span className="text-muted">95% confident, proven by the after photos</span>
              </p>
            </div>
            <p className="rounded-control bg-sunken px-3 py-2.5 text-caption text-ink-2">
              <span className="font-mono text-micro font-semibold text-muted">{REFERENCE.policyId}</span> {REFERENCE.policy}
            </p>
            <div className="flex flex-wrap gap-2" aria-hidden>
              <span className="inline-flex h-10 items-center gap-2 rounded-control bg-verified px-4 text-sm font-semibold text-on-verified">
                <Check weight="bold" className="size-4" /> Approve
              </span>
              <span className="inline-flex h-10 items-center rounded-control border border-line-strong px-4 text-sm font-semibold text-ink">
                Request clarification
              </span>
              <span className="inline-flex h-10 items-center gap-2 rounded-control border border-blocking-line px-4 text-sm font-semibold text-blocking-ink">
                <X weight="bold" className="size-4" /> Reject
              </span>
            </div>
          </div>
        </motion.figure>

        <RevealGroup as="ul" className="space-y-8" stagger={0.12}>
          {POINTS.map(({ Icon, title, body }) => (
            <RevealItem as="li" key={title} className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-control border border-line bg-surface text-accent shadow-raised">
                <Icon aria-hidden className="size-5" />
              </span>
              <div>
                <h3 className="text-subheading text-ink">{title}</h3>
                <p className="mt-1.5 text-body text-ink-2">{body}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}

function Tile({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={emphasis ? "rounded-control border border-blocking-line bg-blocking-soft/50 p-3" : "rounded-control border border-line p-3"}>
      <p className="text-[0.6875rem] font-medium text-muted">{label}</p>
      <p className="mt-1 text-[1.5rem] leading-none font-bold tracking-[-0.02em] text-ink tabular [font-stretch:90%]">{value}</p>
    </div>
  );
}
