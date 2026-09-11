"use client";

import { motion } from "framer-motion";
import { Reveal } from "../motion/reveal";

const LINES = [
  { words: ["The", "model", "proposes."], accent: false },
  { words: ["Policy", "authorizes."], accent: false },
  { words: ["A", "tool", "executes."], accent: true },
];

const MODEL_DOES = [
  "Read photos, receipts, documents and voice notes into observations",
  "Word the messages a person will read",
];

const CODE_DECIDES = [
  "Which claims exist",
  "Whether evidence can support a claim",
  "Reconciliation",
  "Policy verdicts",
  "Authorization",
  "Every state change",
];

/** PRD 18, the deterministic safety boundary, stated as plainly as possible. */
export function TheRule() {
  return (
    <section aria-labelledby="rule-title" className="border-y border-line bg-surface">
      <div className="mx-auto max-w-[1240px] px-4 py-24 sm:px-6 lg:py-32">
        {/* The heading is observed, not the words: masked words start outside their
            clip box, where an IntersectionObserver can never see them. */}
        <motion.h2
          id="rule-title"
          initial="hidden"
          whileInView="shown"
          viewport={{ once: true, amount: 0.5 }}
          className="text-[clamp(2.4rem,1.3rem+4.4vw,5.2rem)] leading-[1.02] font-bold tracking-[-0.04em] text-ink [font-stretch:84%]"
        >
          {LINES.map((line, li) => (
            <span key={li} className="block">
              {line.words.map((word, wi) => (
                <span key={word} className="inline-block overflow-hidden pb-[0.1em] align-bottom">
                  <motion.span
                    className={line.accent ? "inline-block text-accent" : "inline-block"}
                    variants={{
                      hidden: { y: "105%" },
                      shown: {
                        y: "0%",
                        transition: { duration: 0.8, delay: li * 0.22 + wi * 0.06, ease: [0.16, 1, 0.3, 1] },
                      },
                    }}
                  >
                    {word}
                  </motion.span>
                  {wi < line.words.length - 1 && " "}
                </span>
              ))}
            </span>
          ))}
        </motion.h2>

        <div className="mt-16 grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-16">
          <Reveal>
            <h3 className="text-subheading text-ink">Models do two things</h3>
            <ul className="mt-4 space-y-3">
              {MODEL_DOES.map((item) => (
                <li key={item} className="flex gap-3 text-body text-ink-2">
                  <span aria-hidden className="mt-2.5 h-px w-4 shrink-0 bg-accent" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.1}>
            <h3 className="text-subheading text-ink">Deterministic code decides everything else</h3>
            <ul className="mt-4 flex flex-wrap gap-2">
              {CODE_DECIDES.map((item) => (
                <li
                  key={item}
                  className="rounded-full border border-line-strong bg-canvas px-3.5 py-1.5 text-caption font-semibold text-ink transition-colors hover:border-accent hover:text-accent-ink"
                >
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-5 max-w-[56ch] text-caption text-muted">
              Every side effect goes through a narrow tool that checks authorization first, carries an idempotency key, and
              writes an audit event. A refused action is audited too.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
