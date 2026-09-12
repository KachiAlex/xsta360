/**
 * Compute the UTC offset (in ms) of the given IANA timezone at the given instant.
 * Positive means the zone is ahead of UTC (e.g. UTC+1 → +3600000).
 */
function getOffsetMs(timezone: string, date: Date): number {
  const utcParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const zoneParts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const u: Record<string, string> = {};
  const z: Record<string, string> = {};
  utcParts.forEach((p) => (u[p.type] = p.value));
  zoneParts.forEach((p) => (z[p.type] = p.value));
  const utcMs = Date.UTC(+u.year, +u.month - 1, +u.day, +u.hour % 24, +u.minute, +u.second);
  const zoneMs = Date.UTC(+z.year, +z.month - 1, +z.day, +z.hour % 24, +z.minute, +z.second);
  // offset = zone wall clock - UTC wall clock (positive = ahead of UTC)
  return zoneMs - utcMs;
}

/**
 * Compute the start of the current day in the given IANA timezone,
 * returned as a UTC Date.
 */
export function startOfDayInZone(timezone: string = "Africa/Lagos"): Date {
  const now = new Date();
  // Get the current date parts in the target timezone.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const year = +get("year");
  const month = +get("month") - 1;
  const day = +get("day");
  // Build midnight in the target zone as a UTC timestamp.
  // Date.UTC gives midnight UTC for that date; subtract the offset to get
  // the UTC instant that corresponds to midnight in the target zone.
  const offsetMs = getOffsetMs(timezone, now);
  return new Date(Date.UTC(year, month, day) - offsetMs);
}

/** End of day in the given timezone (23:59:59.999 local), as a UTC Date. */
export function endOfDayInZone(timezone: string = "Africa/Lagos"): Date {
  // Compute the start of the NEXT day and subtract 1ms to handle DST correctly.
  const sod = startOfDayInZone(timezone);
  // Get the date parts for the next day in the target zone.
  const next = new Date(sod.getTime() + 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(next);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const nextSod = startOfDayForDate(timezone, +get("year"), +get("month") - 1, +get("day"));
  return new Date(nextSod.getTime() - 1);
}

/** Start of day for a specific date in the target timezone. */
function startOfDayForDate(timezone: string, year: number, month: number, day: number): Date {
  // Use a reference instant within that day to get the correct DST offset.
  const ref = new Date(Date.UTC(year, month, day, 12, 0, 0));
  const offsetMs = getOffsetMs(timezone, ref);
  return new Date(Date.UTC(year, month, day) - offsetMs);
}
