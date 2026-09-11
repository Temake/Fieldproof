"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Check, Copy } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/lib/cx";

/** Copies a value and confirms in place; the label is announced to screen readers. */
export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be unavailable (insecure context); the value stays selectable.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      className={cx(
        "relative grid size-7 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-sunken hover:text-ink",
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={copied ? "done" : "copy"}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.15 }}
          className={copied ? "text-verified" : undefined}
        >
          {copied ? <Check aria-hidden weight="bold" className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
        </motion.span>
      </AnimatePresence>
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}
