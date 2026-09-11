"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gavel, SquaresFour } from "@phosphor-icons/react/dist/ssr";
import { clientApi } from "@/lib/api/client";
import { cx } from "@/lib/cx";
import { usePoll } from "@/lib/use-poll";

const LINKS = [
  { href: "/dashboard", label: "Operations", Icon: SquaresFour, match: ["/dashboard", "/jobs"] },
  { href: "/decisions", label: "Decisions", Icon: Gavel, match: ["/decisions"] },
];

export function ConsoleNav() {
  const pathname = usePathname();
  const pending = usePoll(() => clientApi.decisions("PENDING").then((d) => d.length), 0, {
    interval: () => 8000,
  });

  return (
    <nav aria-label="Console" className="flex items-center gap-1">
      {LINKS.map(({ href, label, Icon, match }) => {
        const active = match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
        const count = href === "/decisions" ? pending.data : 0;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "relative flex h-9 items-center gap-2 rounded-control px-3 text-sm font-semibold transition-colors",
              active ? "text-ink" : "text-muted hover:bg-sunken hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId="console-nav-active"
                aria-hidden
                className="absolute inset-0 rounded-control border border-line bg-surface shadow-raised"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <Icon aria-hidden className="relative size-[18px]" />
            <span className="relative hidden sm:inline">{label}</span>
            <span className="sr-only sm:hidden">{label}</span>
            {count > 0 && (
              <span className="relative grid h-5 min-w-5 place-items-center rounded-full bg-blocking px-1.5 text-[0.6875rem] font-bold text-surface tabular">
                {count}
                <span className="sr-only"> pending</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
