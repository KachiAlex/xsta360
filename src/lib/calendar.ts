/**
 * Google Calendar "Add to Calendar" link generator.
 *
 * Generates a URL that opens Google Calendar with a pre-filled event.
 * No OAuth, no API keys, no client ID — just a URL that opens in a new tab.
 *
 * The user clicks the link → Google Calendar opens with event details
 * pre-filled → user clicks "Save" → done.
 */

interface CalendarEvent {
  title: string;
  startDate: Date;
  endDate?: Date;
  description?: string;
  location?: string;
}

/** Format a Date as Google Calendar's required format: YYYYMMDDTHHMMSSZ */
function formatGCalDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    "00Z"
  );
}

/**
 * Generate a Google Calendar "add event" URL.
 * Opens Google Calendar in a new tab with the event pre-filled.
 */
export function googleCalendarUrl(event: CalendarEvent): string {
  const start = formatGCalDate(event.startDate);
  // Default to 30 minutes after start if no end date.
  const endDate = event.endDate ?? new Date(event.startDate.getTime() + 30 * 60 * 1000);
  const end = formatGCalDate(endDate);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${start}/${end}`,
  });

  if (event.description) {
    params.set("details", event.description);
  }
  if (event.location) {
    params.set("location", event.location);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generate a Google Calendar link for a follow-up reminder.
 * Creates a 30-minute event titled "Follow-up: {leadName}".
 */
export function reminderCalendarUrl(opts: {
  leadName: string;
  leadCompany?: string | null;
  dueAt: Date;
  note?: string | null;
  leadPhone?: string | null;
}): string {
  const title = `Follow-up: ${opts.leadName}`;
  const description = [
    opts.leadCompany ? `Company: ${opts.leadCompany}` : null,
    opts.note ? `Note: ${opts.note}` : null,
    opts.leadPhone ? `Phone: ${opts.leadPhone}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return googleCalendarUrl({
    title,
    startDate: opts.dueAt,
    description: description || undefined,
    location: opts.leadPhone ?? undefined,
  });
}
