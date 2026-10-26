import { logger } from "./logger.js";

const DEFAULT_PEAK_HOURS = [12, 18, 21];
const DEFAULT_TIME_ZONE = "America/Sao_Paulo";
const MIN_LEAD_MS = 10 * 60_000;
const HOUR_TOKEN = /^\d{1,2}$/;

/** Peak posting hours (local to PUBLISH_TZ) from PEAK_HOURS, e.g. "12,18,21"; invalid values are ignored. */
export function peakHours(): number[] {
  const hours = (process.env.PEAK_HOURS ?? "").split(",")
    .map((value) => value.trim())
    .filter((token) => HOUR_TOKEN.test(token) && Number(token) <= 23)
    .map(Number);
  return hours.length > 0 ? [...new Set(hours)].sort((a, b) => a - b) : DEFAULT_PEAK_HOURS;
}

/** PUBLISH_TZ when it names a zone Intl knows; otherwise the default zone, with a warning. */
function resolveTimeZone(value: string | undefined): string {
  if (!value) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    logger.warn({ timeZone: value }, `PUBLISH_TZ invalido, usando ${DEFAULT_TIME_ZONE}`);
    return DEFAULT_TIME_ZONE;
  }
}

/** Offset of `timeZone` from UTC at `instant`, in minutes. */
function zoneOffsetMinutes(instant: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(instant)).map((part) => [part.type, Number(part.value)]),
  );
  const asUtc = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60_000);
}

/** The UTC instant at which the wall clock in `timeZone` reads `hour`:00 on the given calendar day. */
function zonedHourToUtc(year: number, month: number, day: number, hour: number, timeZone: string): number {
  const guess = Date.UTC(year, month, day, hour);
  return guess - zoneOffsetMinutes(guess - zoneOffsetMinutes(guess, timeZone) * 60_000, timeZone) * 60_000;
}

/**
 * The `index`-th upcoming peak-hour slot (0 = next one, at least 10 minutes
 * out), so a batch of shorts is spread over consecutive peaks instead of posted together.
 */
export function nextPeakSlot(now: Date, index = 0, timeZone = resolveTimeZone(process.env.PUBLISH_TZ)): Date {
  const hours = peakHours();
  const slots: number[] = [];
  const localNow = new Date(now.getTime() + zoneOffsetMinutes(now.getTime(), timeZone) * 60_000);
  for (let dayOffset = 0; slots.length <= index; dayOffset++) {
    for (const hour of hours) {
      const slot = zonedHourToUtc(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate() + dayOffset, hour, timeZone);
      if (slot >= now.getTime() + MIN_LEAD_MS) slots.push(slot);
    }
  }
  return new Date(slots[index]!);
}
