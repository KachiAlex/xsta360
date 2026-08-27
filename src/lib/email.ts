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

// ---------------------------------------------------------------------------
// Activity digest email (daily/weekly summary)
// ---------------------------------------------------------------------------

export interface DigestEmailData {
  to: string;
  userName: string;
  overdueCount: number;
  dueTodayCount: number;
  pendingTodos: number;
  quietLeads: number;
  totalPipelineValue: number;
  currency: string;
  appUrl: string;
}

export async function sendDigestEmail(data: DigestEmailData): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Xsta360 <noreply@xsta360.app>";

  const subject = `Your daily digest — ${data.overdueCount} overdue, ${data.dueTodayCount} due today`;
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1E2A22; font-family: 'IBM Plex Mono', monospace;">Hi ${data.userName}, here's your daily summary</h2>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 24px 0;">
        <div style="padding: 16px; background: #F3F0E6; border-radius: 4px;">
          <div style="font-size: 28px; font-weight: bold; color: #B23A2E; font-family: monospace;">${data.overdueCount}</div>
          <div style="font-size: 12px; color: #4A5750;">Overdue follow-ups</div>
        </div>
        <div style="padding: 16px; background: #F3F0E6; border-radius: 4px;">
          <div style="font-size: 28px; font-weight: bold; color: #1E2A22; font-family: monospace;">${data.dueTodayCount}</div>
          <div style="font-size: 12px; color: #4A5750;">Due today</div>
        </div>
        <div style="padding: 16px; background: #F3F0E6; border-radius: 4px;">
          <div style="font-size: 28px; font-weight: bold; color: #1E2A22; font-family: monospace;">${data.pendingTodos}</div>
          <div style="font-size: 12px; color: #4A5750;">Pending to-dos</div>
        </div>
        <div style="padding: 16px; background: #F3F0E6; border-radius: 4px;">
          <div style="font-size: 28px; font-weight: bold; color: #4A5750; font-family: monospace;">${data.quietLeads}</div>
          <div style="font-size: 12px; color: #4A5750;">Quiet leads</div>
        </div>
      </div>

      ${data.totalPipelineValue > 0 ? `
      <p style="color: #4A5750; font-size: 14px;">
        Your open pipeline is worth <strong>${data.currency}${data.totalPipelineValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>.
      </p>` : ""}

      <a href="${data.appUrl}/dashboard" style="display: inline-block; margin-top: 16px; padding: 10px 20px; background: #1E2A22; color: #F3F0E6; text-decoration: none; border-radius: 3px; font-weight: 600;">
        Open dashboard
      </a>
      <p style="color: #9AA39A; font-size: 12px; margin-top: 32px;">— Xsta360 · Manage. Follow Up. Close.</p>
    </div>
  `;

  if (!apiKey) {
    console.log(`[email/dev] Digest To: ${data.to} | Subject: ${subject}`);
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
