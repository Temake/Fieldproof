import Link from "next/link";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/lib/cx";

/** Wordmark: a sealed square (the receipt) beside the name. */
export function Logo({ href = "/", className, compact = false }: { href?: string; className?: string; compact?: boolean }) {
  return (
    <Link
      href={href}
      aria-label="FieldProof home"
      className={cx("group inline-flex items-center gap-2 rounded-control text-ink", className)}
    >
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-[8px] bg-accent text-on-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.2)] transition-transform duration-300 ease-snap group-hover:-rotate-6"
      >
        <Check weight="bold" className="size-4" />
      </span>
      {!compact && (
        <span className="text-[1.0625rem] font-bold tracking-[-0.02em] [font-stretch:92%]">FieldProof</span>
      )}
    </Link>
  );
}
