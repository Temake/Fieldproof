/** Display formatting. Pure functions, safe on server and client. */

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function money(value: number | null | undefined): string {
  return value == null ? "-" : currency.format(value);
}

/** "+$54.00" for an increase, used wherever an amount is a delta. */
export function signedMoney(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${currency.format(Math.abs(value))}`;
}

export function percent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function clock(iso: string, withSeconds = false): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hour12: false,
  });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function relative(iso: string, now: number = Date.now()): string {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function shortHash(sha: string, size = 10): string {
  return sha.length > size ? `${sha.slice(0, size)}` : sha;
}

/** snake_case or SCREAMING_CASE enum value to sentence case. */
export function humanize(value: string): string {
  const words = value.replaceAll("_", " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function bytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
