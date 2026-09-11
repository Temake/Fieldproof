"use client";

import { motion } from "framer-motion";
import { ArrowsClockwise, Coins, Files, LockKey } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/lib/cx";
import { INVARIANTS } from "@/lib/reference";
import { Reveal } from "../motion/reveal";

const CELLS = [
  {
    key: "execution",
    title: "Execution is exactly-once",
    Icon: ArrowsClockwise,
    items: INVARIANTS.execution,
    className: "lg:col-span-6 lg:row-span-2 bg-accent-soft border-accent-line",
    iconClass: "bg-accent text-on-accent",
    note: "How: every side effect carries an idempotency key, one run per job holds a lock, and a conflict's id is a fingerprint of the values involved, so an approval for 3 against 2 never carries over to 4 against 2.",
  },
  {
    key: "evidence",
    title: "Evidence has to fit the claim",
    Icon: Files,
    items: INVARIANTS.evidence,
    className: "lg:col-span-6 bg-surface border-line",
    iconClass: "bg-sunken text-ink",
  },
  {
    key: "closing",
    title: "Nothing closes early",
    Icon: LockKey,
    items: INVARIANTS.closing,
    className: "lg:col-span-3 bg-verified-soft border-verified-line",
    iconClass: "bg-verified text-on-verified",
  },
  {
    key: "money",
    title: "Money needs a person",
    Icon: Coins,
    items: INVARIANTS.money,
    className: "lg:col-span-3 bg-ink border-ink text-canvas",
    iconClass: "bg-canvas/15 text-canvas",
    inverted: true,
  },
] as const;

/** README §32: ten invariants, each enforced in code and pinned by a test. */
export function Guarantees() {
  return (
    <section id="guarantees" aria-labelledby="guarantees-title" className="mx-auto max-w-[1240px] scroll-mt-20 px-4 py-24 sm:px-6 lg:py-32">
      <Reveal className="max-w-[44rem]">
        <h2 id="guarantees-title" className="text-title text-ink">
          Ten rules the workflow cannot break.
        </h2>
        <p className="mt-5 max-w-[60ch] text-lead text-ink-2">
          Each is enforced in code and pinned by a test, not left to a prompt.
        </p>
      </Reveal>

      <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-12 lg:grid-rows-[auto_auto]">
        {CELLS.map((cell, i) => (
          <motion.article
            key={cell.key}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.7, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ y: -3 }}
            className={cx("flex flex-col rounded-panel border p-6 lg:p-7", cell.className)}
          >
            <span className={cx("grid size-10 place-items-center rounded-control", cell.iconClass)}>
              <cell.Icon aria-hidden className="size-5" weight="bold" />
            </span>
            <h3 className={cx("mt-6 text-subheading", "inverted" in cell ? "text-canvas" : "text-ink")}>{cell.title}</h3>
            <ul className="mt-4 space-y-3">
              {cell.items.map((item) => (
                <li key={item.id}>
                  <p className={cx("text-body", "inverted" in cell ? "text-canvas/85" : "text-ink-2")}>{item.text}</p>
                  <p className={cx("mt-0.5 font-mono text-[0.6875rem] font-semibold", "inverted" in cell ? "text-canvas/60" : "text-muted")}>
                    {item.id}
                  </p>
                </li>
              ))}
            </ul>
            {"note" in cell && (
              <p className="mt-auto border-t border-accent-line pt-5 text-caption text-ink-2 lg:mt-10">{cell.note}</p>
            )}
          </motion.article>
        ))}
      </div>
    </section>
  );
}
