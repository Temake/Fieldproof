"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { useEffect, useState } from "react";
import { ArrowRight, List, X } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/lib/cx";
import { ButtonLink } from "../ui/button";
import { Logo } from "../ui/logo";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#decision", label: "Decisions" },
  { href: "#guarantees", label: "Guarantees" },
  { href: "#receipt", label: "Receipt" },
];

/** Transparent over the hero, gains a surface once the page moves under it. */
export function MarketingNav() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 12));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={cx(
        "fixed inset-x-0 top-0 z-30 transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled || open ? "border-b border-line bg-canvas/85 backdrop-blur-md" : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-6 px-4 sm:px-6 lg:h-[4.5rem]">
        <Logo />
        <nav aria-label="Primary" className="ml-6 hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="group relative rounded-control px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:text-ink"
            >
              {link.label}
              <span
                aria-hidden
                className="absolute inset-x-3 bottom-1 h-px origin-left scale-x-0 bg-ink transition-transform duration-300 ease-snap group-hover:scale-x-100"
              />
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ButtonLink href="/dashboard" size="sm" iconRight={<ArrowRight weight="bold" className="size-3.5" />}>
            Open console
          </ButtonLink>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid size-10 place-items-center rounded-control text-ink hover:bg-sunken lg:hidden"
          >
            {open ? <X aria-hidden className="size-5" /> : <List aria-hidden className="size-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            id="mobile-menu"
            aria-label="Primary"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-line lg:hidden"
          >
            <ul className="space-y-1 px-4 py-4">
              {LINKS.map((link, i) => (
                <motion.li key={link.href} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i }}>
                  <a
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-control px-3 py-3 text-body font-semibold text-ink hover:bg-sunken"
                  >
                    {link.label}
                  </a>
                </motion.li>
              ))}
            </ul>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
