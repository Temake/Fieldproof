"use client";

import { AnimatePresence, motion } from "framer-motion";

/**
 * A number that rolls when it changes, so a live count changing under the
 * viewer's eyes is noticed. Screen readers get the plain value.
 */
export function Ticker({ value, className }: { value: number | string; className?: string }) {
  return (
    <span className={`relative inline-flex overflow-hidden tabular ${className ?? ""}`}>
      <span className="sr-only">{value}</span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={String(value)}
          aria-hidden
          initial={{ y: "70%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{ y: "-70%", opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
