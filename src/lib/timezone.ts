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
  // Build a UTC date for midnight in the target timezone.
  // We need to find the UTC offset of the timezone at the current moment.
  const localMidnightStr = `${get("year")}-${get("month")}-${get("day")}T00:00:00`;
  // Get the offset by comparing the same instant in both timezones.
  const utcStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const zoneStr = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const utcParts: Record<string, string> = {};
  const zoneParts: Record<string, string> = {};
  utcStr.forEach((p) => (utcParts[p.type] = p.value));
  zoneStr.forEach((p) => (zoneParts[p.type] = p.value));
  // Calculate offset in minutes
  const utcMs = Date.UTC(
    +utcParts.year, +utcParts.month - 1, +utcParts.day,
    +utcParts.hour % 24, +utcParts.minute, +utcParts.second,
  );
  const zoneMs = Date.UTC(
    +zoneParts.year, +zoneParts.month - 1, +zoneParts.day,
    +zoneParts.hour % 24, +zoneParts.minute, +zoneParts.second,
  );
  const offsetMs = utcMs - zoneMs;
  // Midnight in the target zone, converted to UTC
  const localMidnight = new Date(localMidnightStr);
  return new Date(localMidnight.getTime() - offsetMs);
}

/** End of day in the given timezone (23:59:59.999 local), as a UTC Date. */
export function endOfDayInZone(timezone: string = "Africa/Lagos"): Date {
  const sod = startOfDayInZone(timezone);
  return new Date(sod.getTime() + 24 * 60 * 60 * 1000 - 1);
}
