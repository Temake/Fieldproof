import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

/** Placeholder shaped like the content it stands in for. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("skeleton rounded-md", className)} />;
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** An empty state says why it is empty and how to fill it. */
export function EmptyState({ icon, title, children, action, className }: EmptyStateProps) {
  return (
    <div className={cx("flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon && (
        <div className="mb-4 grid size-12 place-items-center rounded-panel border border-line bg-sunken text-muted">
          {icon}
        </div>
      )}
      <p className="text-subheading text-ink">{title}</p>
      {children && <div className="mt-1.5 max-w-sm text-body text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Screen-reader-only text. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
