import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import type { Tone } from "@/lib/vocabulary";

const TONES: Record<Tone, string> = {
  agent: "bg-accent-soft text-accent-ink ring-accent-line",
  verified: "bg-verified-soft text-verified-ink ring-verified-line",
  waiting: "bg-waiting-soft text-waiting-ink ring-waiting-line",
  blocking: "bg-blocking-soft text-blocking-ink ring-blocking-line",
  neutral: "bg-neutral-soft text-neutral-ink ring-neutral-line",
};

/** Text colour for a tone, for icons and inline accents outside a badge. */
export const TONE_TEXT: Record<Tone, string> = {
  agent: "text-accent",
  verified: "text-verified",
  waiting: "text-waiting",
  blocking: "text-blocking",
  neutral: "text-muted",
};

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  icon?: ReactNode;
  /** A pulsing dot: only for states that are genuinely live right now. */
  live?: boolean;
  size?: "sm" | "md";
  className?: string;
  title?: string;
}

export function Badge({
  tone = "neutral",
  children,
  icon,
  live,
  size = "sm",
  className,
  title,
}: BadgeProps) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex max-w-full items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset whitespace-nowrap",
        size === "sm" ? "h-6 px-2.5 text-[0.75rem]" : "h-7 px-3 text-[0.8125rem]",
        TONES[tone],
        className,
      )}
    >
      {live && <span aria-hidden className={cx("live-dot size-1.5", TONE_TEXT[tone])} />}
      {icon && !live && <span aria-hidden className="-ml-0.5 inline-flex">{icon}</span>}
      <span className="truncate">{children}</span>
    </span>
  );
}
