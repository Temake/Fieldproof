import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { CaretDown, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/lib/cx";

const CONTROL =
  "w-full rounded-control border bg-surface text-ink text-sm " +
  "transition-[border-color,box-shadow,background-color] duration-150 ease-snap " +
  "placeholder:text-muted/80 hover:border-faint " +
  "focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/20 " +
  "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted " +
  "aria-invalid:border-blocking aria-invalid:focus:ring-blocking/20";

export interface ControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

interface FieldProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  className?: string;
  children: (control: ControlProps) => ReactNode;
}

/**
 * Label above, control, then hint and error below - wired together with
 * aria-describedby and aria-invalid so screen readers hear all three.
 */
export function Field({ id, label, hint, error, optional, className, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-sm font-semibold text-ink">
        <span>{label}</span>
        {optional && <span className="text-micro font-normal text-muted">Optional</span>}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && !error && (
        <p id={hintId} className="text-micro text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-start gap-1 text-micro font-medium text-blocking-ink">
          <WarningCircle aria-hidden weight="fill" className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(CONTROL, "h-10 px-3", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(CONTROL, "min-h-24 px-3 py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select className={cx(CONTROL, "h-10 appearance-none pr-9 pl-3", className)} {...props}>
        {children}
      </select>
      <CaretDown
        aria-hidden
        weight="bold"
        className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted"
      />
    </span>
  );
}

export function Checkbox({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cx("inline-flex cursor-pointer items-center gap-2 text-sm text-ink select-none", className)}>
      <input
        type="checkbox"
        className="size-4 cursor-pointer rounded-[4px] border-line-strong accent-[var(--accent)]"
        {...props}
      />
      {label}
    </label>
  );
}
