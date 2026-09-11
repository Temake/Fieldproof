import type { ReactNode } from "react";
import { CheckCircle, Info, WarningCircle, WarningOctagon } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/lib/cx";

type AlertTone = "info" | "success" | "warning" | "danger";

const STYLES: Record<AlertTone, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: "border-accent-line bg-accent-soft", icon: "text-accent", Icon: Info },
  success: { box: "border-verified-line bg-verified-soft", icon: "text-verified", Icon: CheckCircle },
  warning: { box: "border-waiting-line bg-waiting-soft", icon: "text-waiting", Icon: WarningCircle },
  danger: { box: "border-blocking-line bg-blocking-soft", icon: "text-blocking", Icon: WarningOctagon },
};

interface AlertProps {
  tone?: AlertTone;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Contextual, persistent message. Toasts are for transient confirmations only. */
export function Alert({ tone = "info", title, children, action, className }: AlertProps) {
  const { box, icon, Icon } = STYLES[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cx("flex flex-col gap-3 rounded-panel border p-4 sm:flex-row sm:items-start", box, className)}
    >
      <Icon aria-hidden weight="fill" className={cx("size-5 shrink-0", icon)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {children && <div className="mt-1 text-caption text-ink-2">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
