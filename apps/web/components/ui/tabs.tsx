"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/lib/cx";

export interface TabItem<K extends string> {
  key: K;
  label: ReactNode;
  count?: number;
}

interface TabsProps<K extends string> {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
  idPrefix?: string;
  className?: string;
}

/**
 * WAI-ARIA tabs with arrow-key navigation. The active indicator is one shared
 * element that slides between tabs, so the change of view is felt, not just seen.
 */
export function Tabs<K extends string>({ items, value, onChange, label, idPrefix, className }: TabsProps<K>) {
  const fallback = useId();
  const prefix = idPrefix ?? fallback;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent, index: number) {
    const last = items.length - 1;
    const next =
      event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null;
    if (next == null) return;
    event.preventDefault();
    refs.current[next]?.focus();
    onChange(items[next].key);
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cx("relative flex gap-1 overflow-x-auto border-b border-line", className)}
    >
      {items.map((item, index) => {
        const selected = item.key === value;
        return (
          <button
            key={item.key}
            ref={(el) => {
              refs.current[index] = el;
            }}
            role="tab"
            id={`${prefix}-tab-${item.key}`}
            aria-selected={selected}
            aria-controls={`${prefix}-panel-${item.key}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.key)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cx(
              "relative flex h-11 shrink-0 items-center gap-2 px-3 text-sm font-semibold transition-colors",
              selected ? "text-ink" : "text-muted hover:text-ink",
            )}
          >
            {item.label}
            {item.count != null && (
              <span
                className={cx(
                  "rounded-full px-1.5 py-px text-[0.6875rem] tabular",
                  selected ? "bg-ink text-canvas" : "bg-neutral-soft text-neutral-ink",
                )}
              >
                {item.count}
              </span>
            )}
            {selected && (
              <motion.span
                layoutId={`${prefix}-indicator`}
                aria-hidden
                className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel<K extends string>({
  tab,
  value,
  idPrefix,
  children,
}: {
  tab: K;
  value: K;
  idPrefix: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${tab}`}
      aria-labelledby={`${idPrefix}-tab-${tab}`}
      hidden={tab !== value}
      tabIndex={0}
      className="focus-visible:outline-offset-4"
    >
      {tab === value && children}
    </div>
  );
}

interface SegmentedLinksProps {
  items: { href: string; label: ReactNode; active: boolean; count?: number }[];
  label: string;
  layoutId: string;
  className?: string;
}

/** Filter control whose state lives in the URL, so views are shareable. */
export function SegmentedLinks({ items, label, layoutId, className }: SegmentedLinksProps) {
  return (
    <nav aria-label={label} className={cx("inline-flex rounded-control border border-line bg-sunken p-1", className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          scroll={false}
          aria-current={item.active ? "page" : undefined}
          className={cx(
            "relative flex h-8 items-center gap-1.5 rounded-[7px] px-3 text-[0.8125rem] font-semibold whitespace-nowrap transition-colors",
            item.active ? "text-ink" : "text-muted hover:text-ink",
          )}
        >
          {item.active && (
            <motion.span
              layoutId={layoutId}
              aria-hidden
              className="absolute inset-0 rounded-[7px] border border-line bg-surface shadow-raised"
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
            />
          )}
          <span className="relative">{item.label}</span>
          {item.count != null && <span className="relative text-muted tabular">{item.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
