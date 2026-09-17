import { dateKeyInZone, timePartsInZone, weekdayInZone } from "@/lib/utils";

export const TV_BEDROOM_ID = "bedroom";

export const TV_BEDROOM_WAKE_LIGHTS = {
  on: true,
  brightness_pct: 1,
  color_temp_kelvin: 3200,
} as const;

function scheduledWakeTime(day: number): { hour: number; minute: number } | null {
  if (day === 1 || day === 3) return { hour: 8, minute: 45 };
  if (day === 2 || day === 4) return { hour: 8, minute: 30 };
  return null;
}

export function isPastTvScheduledWake(now: Date, tz: string): boolean {
  const wake = scheduledWakeTime(weekdayInZone(now, tz));
  if (!wake) return false;
  const { hour, minute } = timePartsInZone(now, tz);
  return hour > wake.hour || (hour === wake.hour && minute >= wake.minute);
}

export function tvWakeDateKey(now: Date, tz: string): string {
  return dateKeyInZone(now, tz);
}
