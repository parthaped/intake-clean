import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

function toValidDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: string | Date | null | undefined): string {
  const d = toValidDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toValidDate(value);
  if (!d) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeTime(value: string | Date | null | undefined): string {
  const d = toValidDate(value);
  if (!d) return "—";
  // Clock skew or "scheduled in the future" timestamps shouldn't render as
  // "-3s ago". Treat anything within ~5s of "now or later" as "just now",
  // and farther-future values as "in Xm" for symmetry.
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) {
    const aheadSec = Math.round(-diffMs / 1000);
    if (aheadSec < 5) return "just now";
    if (aheadSec < 60) return `in ${aheadSec}s`;
    const min = Math.round(aheadSec / 60);
    if (min < 60) return `in ${min}m`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `in ${hr}h`;
    return formatDate(d);
  }
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return formatDate(d);
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((n) => n[0]!.toUpperCase()).join("");
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function truncate(value: string, max = 80): string {
  if (max <= 0) return "";
  if (max === 1) return value.length <= 1 ? value : "…";
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

// `redirect()` from `next/navigation` signals navigation by throwing an error
// whose `digest` starts with "NEXT_REDIRECT". When a server action that
// redirects is invoked from a client `try { await action() } catch` block,
// that digest error MUST be re-thrown — otherwise the catch swallows it,
// the navigation never happens, and the user is stuck on the form thinking
// the action failed (even though it succeeded server-side).
export function isNextRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}
