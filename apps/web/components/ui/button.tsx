import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/lib/cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "approve";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control font-semibold select-none " +
  "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-snap " +
  "active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 disabled:active:translate-y-0 " +
  "aria-disabled:pointer-events-none aria-disabled:opacity-55";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-on-accent hover:bg-accent-hover shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(var(--shadow-rgb)/0.2)]",
  approve:
    "bg-verified text-on-verified hover:bg-verified-hover shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(var(--shadow-rgb)/0.2)]",
  secondary:
    "border border-line-strong bg-surface text-ink hover:border-faint hover:bg-sunken",
  ghost: "text-ink-2 hover:bg-sunken hover:text-ink",
  danger:
    "border border-blocking-line bg-surface text-blocking-ink hover:border-blocking hover:bg-blocking-soft",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[0.8125rem]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-[0.9375rem]",
};

export function buttonStyles(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cx(BASE, VARIANTS[variant], SIZES[size], className);
}

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

type ButtonProps = CommonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    /** Shows a spinner, keeps the label for layout stability, blocks clicks. */
    loading?: boolean;
  };

export function Button({
  variant,
  size,
  icon,
  iconRight,
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles(variant, size, cx("group", className))}
      {...rest}
    >
      {loading ? (
        <CircleNotch aria-hidden className="spin size-4" weight="bold" />
      ) : (
        icon && <span aria-hidden className="-ml-0.5 inline-flex">{icon}</span>
      )}
      {children}
      {iconRight && !loading && (
        <span
          aria-hidden
          className="-mr-0.5 inline-flex transition-transform duration-200 ease-snap group-hover:translate-x-0.5"
        >
          {iconRight}
        </span>
      )}
    </button>
  );
}

type ButtonLinkProps = CommonProps & ComponentProps<typeof Link>;

export function ButtonLink({
  variant,
  size,
  icon,
  iconRight,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={cx("group", buttonStyles(variant, size, className))} {...rest}>
      {icon && <span aria-hidden className="-ml-0.5 inline-flex">{icon}</span>}
      {children}
      {iconRight && (
        <span
          aria-hidden
          className="-mr-0.5 inline-flex transition-transform duration-200 ease-snap group-hover:translate-x-0.5"
        >
          {iconRight}
        </span>
      )}
    </Link>
  );
}
