import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

interface PanelProps {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "aside";
  padded?: boolean;
  id?: string;
  "aria-labelledby"?: string;
}

/** The one elevated surface. Use it only when grouping needs a boundary. */
export function Panel({ children, className, as: Tag = "section", padded = true, ...rest }: PanelProps) {
  return (
    <Tag
      className={cx(
        "rounded-panel border border-line bg-surface shadow-raised",
        padded && "p-5 sm:p-6",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

interface PanelHeaderProps {
  title: ReactNode;
  id?: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PanelHeader({ title, id, description, actions, className }: PanelHeaderProps) {
  return (
    <header className={cx("mb-4 flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-subheading text-ink">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-caption text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Key/value list with consistent rhythm, used in side panels. */
export function Facts({ items, className }: { items: { label: ReactNode; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cx("divide-y divide-line", className)}>
      {items.map((item, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
          <dt className="text-caption text-muted">{item.label}</dt>
          <dd className="text-right text-sm font-semibold text-ink tabular">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
