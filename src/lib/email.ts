import "server-only";

export interface ReminderEmailData {
  to: string;
  leadName: string;
  leadCompany?: string | null;
  dueAt: Date;
  note?: string | null;
  appUrl: string;
}

/**
 * Send a follow-up reminder email. Uses Resend if RESEND_API_KEY is set;
 * otherwise logs to console (dev mode). Returns true on success.
 * On failure, throws with the error message so the caller can record it.
 */
export async function sendReminderEmail(data: ReminderEmailData): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Xsta360 <noreply@xsta360.app>";

  const subject = `Follow-up reminder: ${data.leadName}`;
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1E2A22; font-family: 'IBM Plex Mono', monospace;">Follow-up reminder</h2>
      <p style="color: #4A5750; font-size: 15px;">
        It's time to follow up with <strong>${data.leadName}</strong>${data.leadCompany ? ` from ${data.leadCompany}` : ""}.
      </p>
      ${data.note ? `<p style="color: #4A5750; font-size: 14px; padding: 12px; background: #F3F0E6; border-radius: 4px;">${data.note}</p>` : ""}
      <p style="color: #4A5750; font-size: 13px; margin-top: 24px;">
        Due: ${data.dueAt.toLocaleString()}
      </p>
      <a href="${data.appUrl}/dashboard" style="display: inline-block; margin-top: 16px; padding: 10px 20px; background: #1E2A22; color: #F3F0E6; text-decoration: none; border-radius: 3px; font-weight: 600;">
        Open dashboard
      </a>
      <p style="color: #9AA39A; font-size: 12px; margin-top: 32px;">— Xsta360 · Manage. Follow Up. Close.</p>
    </div>
  `;

  if (!apiKey) {
    // Dev mode: log instead of sending.
    console.log(`[email/dev] To: ${data.to} | Subject: ${subject}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: data.to, subject, html }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend API error ${res.status}: ${text}`);
  }
}
