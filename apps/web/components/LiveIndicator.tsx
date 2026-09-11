"use client";

import { useEffect, useState } from "react";
import { cx } from "@/lib/cx";
import { relative } from "@/lib/format";

interface LiveIndicatorProps {
  updatedAt: number;
  error?: Error | null;
  /** False when nothing is expected to change (e.g. a closed job). */
  live?: boolean;
  className?: string;
}

/** "Live, updated 4s ago" - tells the viewer the page is not a snapshot. */
export function LiveIndicator({ updatedAt, error, live = true, className }: LiveIndicatorProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const label = error ? "Reconnecting" : live ? "Live" : "Up to date";
  return (
    <p
      className={cx("inline-flex items-center gap-2 text-micro font-medium", error ? "text-waiting-ink" : "text-muted", className)}
      aria-live="off"
    >
      <span
        aria-hidden
        className={cx(
          "inline-block size-2 rounded-full",
          error ? "bg-waiting" : live ? "live-dot text-verified" : "bg-faint",
        )}
      />
      <span>
        {label}
        <span className="text-faint"> · </span>
        updated {relative(new Date(updatedAt).toISOString(), now)}
      </span>
    </p>
  );
}
