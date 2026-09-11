"use client";

import { motion } from "framer-motion";
import { ArrowRight, Plus } from "@phosphor-icons/react/dist/ssr";
import { ButtonLink } from "../ui/button";

export function ClosingCta() {
  return (
    <section aria-labelledby="cta-title" className="mx-auto max-w-[1240px] px-4 pb-24 sm:px-6 lg:pb-32">
      <motion.div
        initial={{ opacity: 0, y: 32, scale: 0.98 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-panel bg-accent px-6 py-14 text-on-accent sm:px-12 sm:py-20"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -right-24 size-[28rem] rounded-full opacity-25"
          style={{ background: "radial-gradient(closest-side, var(--on-accent), transparent)" }}
        />
        <h2 id="cta-title" className="relative max-w-[18ch] text-title">
          Close the next job without the paperwork.
        </h2>
        <p className="relative mt-5 max-w-[48ch] text-lead opacity-90">
          Create a work order, send the technician their link, and watch the timeline fill in.
        </p>
        <div className="relative mt-9 flex flex-wrap gap-3">
          <ButtonLink
            href="/dashboard"
            size="lg"
            variant="secondary"
            className="border-transparent"
            iconRight={<ArrowRight weight="bold" className="size-4" />}
          >
            Open console
          </ButtonLink>
          <ButtonLink
            href="/jobs/new"
            size="lg"
            variant="ghost"
            className="text-on-accent ring-1 ring-on-accent/40 hover:bg-on-accent/10 hover:text-on-accent"
            icon={<Plus weight="bold" className="size-4" />}
          >
            Create a work order
          </ButtonLink>
        </div>
      </motion.div>
    </section>
  );
}
