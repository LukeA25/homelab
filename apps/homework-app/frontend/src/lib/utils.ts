import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Assignment } from "./types";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** `datetime-local` wants exactly `YYYY-MM-DDTHH:MM`. */
export function toInputValue(due: string): string {
  if (!due) return "";
  const normalized = due.replace(" ", "T");
  return normalized.length >= 16 ? normalized.slice(0, 16) : `${normalized}T23:59`.slice(0, 16);
}

/** Default new-assignment due date: tonight at 11:59pm. */
export function defaultDue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T23:59`;
}

/** Default recurring end date: ~8 weeks out. */
export function defaultRecurringEnd(): string {
  const d = new Date();
  d.setDate(d.getDate() + 56);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Python weekday(): Monday = 0 … Sunday = 6. */
export const WEEKDAYS = [
  { value: 0, label: "Monday" },
  { value: 1, label: "Tuesday" },
  { value: 2, label: "Wednesday" },
  { value: 3, label: "Thursday" },
  { value: 4, label: "Friday" },
  { value: 5, label: "Saturday" },
  { value: 6, label: "Sunday" },
] as const;

export function weekdayFromDueInput(due: string): number {
  const datePart = due.slice(0, 10);
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return 0;
  const d = new Date(year, month - 1, day);
  if (Number.isNaN(d.getTime())) return 0;
  return (d.getDay() + 6) % 7;
}

export function toDateInputValue(raw: string | null | undefined): string {
  if (!raw) return defaultRecurringEnd();
  return raw.split("T")[0]?.split(" ")[0] ?? defaultRecurringEnd();
}

export type BucketKey = "overdue" | "today" | "tomorrow" | "week" | "later" | "undated";

export const BUCKET_LABELS: Record<BucketKey, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This week",
  later: "Later",
  undated: "No date",
};

export const BUCKET_ORDER: BucketKey[] = [
  "overdue",
  "today",
  "tomorrow",
  "week",
  "later",
  "undated",
];

export function bucketFor(a: Assignment): BucketKey {
  if (a.daysUntil === null) return "undated";
  if (a.overdue) return "overdue";
  if (a.daysUntil === 0) return "today";
  if (a.daysUntil === 1) return "tomorrow";
  if (a.daysUntil <= 6) return "week";
  return "later";
}

export function groupByBucket(items: Assignment[]): [BucketKey, Assignment[]][] {
  const groups = new Map<BucketKey, Assignment[]>();
  for (const item of items) {
    const key = bucketFor(item);
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  return BUCKET_ORDER.filter((k) => groups.has(k)).map((k) => [k, groups.get(k)!]);
}
