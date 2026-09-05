import "server-only";
import nodemailer from "nodemailer";

const from = process.env.EMAIL_FROM ?? "Xsta360 <noreply@xsta360.app>";
const smtpHost = process.env.SMTP_HOST ?? "smtp-relay.brevo.com";
const smtpPort = Number(process.env.SMTP_PORT ?? "587");
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;

const transport = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465,
  requireTLS: smtpPort === 587,
  auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
});

export async function sendMail(
  to: string,
  subject: string,
  html: string,
  options?: { senderName?: string; replyTo?: string },
): Promise<void> {
  if (!smtpUser || !smtpPass) {
    console.log(`[email/dev] To: ${to} | Subject: ${subject}${options?.senderName ? ` | From: ${options.senderName}` : ""}`);
    return;
  }

  // Build the From header: "Sender Name <noreply@...>" or default.
  const fromAddress = from;
  const fromHeader = options?.senderName
    ? `${options.senderName} <${extractEmail(fromAddress)}>`
    : fromAddress;

  await transport.sendMail({
    from: fromHeader,
    to,
    subject,
    html,
    replyTo: options?.replyTo || undefined,
  });
}

/** Extract the email address from a "Name <email>" string. */
function extractEmail(s: string): string {
  const match = s.match(/<([^>]+)>/);
  return match ? match[1] : s;
}

export interface CardLeadEmailData {
  to: string;
  repName: string;
  leadName: string;
  leadCompany?: string | null;
  cardName: string;
  leadUrl: string;
  appUrl: string;
}

export interface CardRescanEmailData {
  to: string;
  repName: string;
  leadName: string;
  leadCompany?: string | null;
  cardName: string;
  leadUrl: string;
  appUrl: string;
}

export interface ContactSavedEmailData {
  to: string;
  repName: string;
  cardName: string;
  cardUrl: string;
  appUrl: string;
}

export interface ReminderEmailData {
  to: string;
  leadName: string;
  leadCompany?: string | null;
  dueAt: Date;
  note?: string | null;
  appUrl: string;
}

/**
 * Send a follow-up reminder email. Uses Brevo SMTP if configured;
 * otherwise logs to console (dev mode). Returns true on success.
 * On failure, throws with the error message so the caller can record it.
 */
export async function sendReminderEmail(data: ReminderEmailData): Promise<void> {
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

  await sendMail(data.to, subject, html);
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

  await sendMail(data.to, subject, html);
}

// ---------------------------------------------------------------------------
// Contact card lead notifications
// ---------------------------------------------------------------------------

export async function sendCardLeadEmail(data: CardLeadEmailData): Promise<void> {
  const subject = `New lead from your contact card — ${data.leadName}`;
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1E2A22; font-family: 'IBM Plex Mono', monospace;">You scanned up a new lead, ${data.repName}</h2>
      <p style="color: #4A5750; font-size: 15px;">
        <strong>${data.leadName}</strong>${data.leadCompany ? ` from ${data.leadCompany}` : ""} just submitted their info through your Xsta360 contact card (${data.cardName}).
      </p>
      <a href="${data.leadUrl}" style="display: inline-block; margin-top: 16px; padding: 10px 20px; background: #1E2A22; color: #F3F0E6; text-decoration: none; border-radius: 3px; font-weight: 600;">
        View lead
      </a>
      <p style="color: #9AA39A; font-size: 12px; margin-top: 32px;">— Xsta360 · Manage. Follow Up. Close.</p>
    </div>
  `;

  await sendMail(data.to, subject, html);
}

export async function sendCardRescanEmail(data: CardRescanEmailData): Promise<void> {
  const subject = `${data.leadName} re-scanned your contact card`;
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1E2A22; font-family: 'IBM Plex Mono', monospace;">${data.leadName} scanned your card again</h2>
      <p style="color: #4A5750; font-size: 15px;">
        <strong>${data.leadName}</strong>${data.leadCompany ? ` from ${data.leadCompany}` : ""} re-scanned your contact card (${data.cardName}). A note has been added to their existing lead record.
      </p>
      <a href="${data.leadUrl}" style="display: inline-block; margin-top: 16px; padding: 10px 20px; background: #1E2A22; color: #F3F0E6; text-decoration: none; border-radius: 3px; font-weight: 600;">
        View lead
      </a>
      <p style="color: #9AA39A; font-size: 12px; margin-top: 32px;">— Xsta360 · Manage. Follow Up. Close.</p>
    </div>
  `;

  await sendMail(data.to, subject, html);
}

export async function sendContactSavedEmail(data: ContactSavedEmailData): Promise<void> {
  const subject = `Someone saved your contact — ${data.cardName}`;
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1E2A22; font-family: 'IBM Plex Mono', monospace;">Hi ${data.repName}, your contact was saved</h2>
      <p style="color: #4A5750; font-size: 15px;">
        Someone just saved your contact card (${data.cardName}) to their phone. You may hear from them soon.
      </p>
      <a href="${data.cardUrl}" style="display: inline-block; margin-top: 16px; padding: 10px 20px; background: #1E2A22; color: #F3F0E6; text-decoration: none; border-radius: 3px; font-weight: 600;">
        View your card
      </a>
      <p style="color: #9AA39A; font-size: 12px; margin-top: 32px;">— Xsta360 · Manage. Follow Up. Close.</p>
    </div>
  `;

  await sendMail(data.to, subject, html);
}

// ---------------------------------------------------------------------------
// Lead assignment notification
// ---------------------------------------------------------------------------

export interface LeadAssignedEmailData {
  to: string;
  userName: string;
  leadName: string;
  leadCompany?: string | null;
  appUrl: string;
}

export async function sendLeadAssignedEmail(data: LeadAssignedEmailData): Promise<void> {
  const subject = `New lead assigned: ${data.leadName}`;
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1E2A22; font-family: 'IBM Plex Mono', monospace;">A new lead has been assigned to you</h2>
      <p style="color: #4A5750; font-size: 15px;">
        Hi ${data.userName}, <strong>${data.leadName}</strong>${data.leadCompany ? ` from ${data.leadCompany}` : ""} was just assigned to you in Xsta360.
      </p>
      <a href="${data.appUrl}/leads" style="display: inline-block; margin-top: 16px; padding: 10px 20px; background: #1E2A22; color: #F3F0E6; text-decoration: none; border-radius: 3px; font-weight: 600;">
        View leads
      </a>
      <p style="color: #9AA39A; font-size: 12px; margin-top: 32px;">— Xsta360 · Manage. Follow Up. Close.</p>
    </div>
  `;

  await sendMail(data.to, subject, html);
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

export interface PasswordResetEmailData {
  to: string;
  resetUrl: string;
}

export async function sendPasswordResetEmail(data: PasswordResetEmailData): Promise<void> {
  const subject = "Reset your Xsta360 password";
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1E2A22; font-family: 'IBM Plex Mono', monospace;">Reset your password</h2>
      <p style="color: #4A5750; font-size: 15px;">
        Click the button below to reset your Xsta360 password. This link expires in 1 hour.
      </p>
      <a href="${data.resetUrl}" style="display: inline-block; margin-top: 16px; padding: 10px 20px; background: #1E2A22; color: #F3F0E6; text-decoration: none; border-radius: 3px; font-weight: 600;">
        Reset password
      </a>
      <p style="color: #4A5750; font-size: 13px; margin-top: 24px; word-break: break-all;">
        Or paste this URL in your browser:<br>${data.resetUrl}
      </p>
      <p style="color: #9AA39A; font-size: 12px; margin-top: 32px;">— Xsta360 · Manage. Follow Up. Close.</p>
    </div>
  `;

  await sendMail(data.to, subject, html);
}

// ---------------------------------------------------------------------------
// Billing emails — trial reminders, dunning, receipts
// ---------------------------------------------------------------------------

export interface TrialEndingEmailData {
  to: string;
  userName: string;
  orgName: string;
  daysLeft: number;
  amount: number;
  currency: string;
  appUrl: string;
}

/** Remind the workspace admin that the trial is ending soon. */
export async function sendTrialEndingEmail(data: TrialEndingEmailData): Promise<void> {
  const subject = `Your Xsta360 trial ends in ${data.daysLeft} day${data.daysLeft !== 1 ? "s" : ""}`;
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1E2A22; font-family: 'IBM Plex Mono', monospace;">Your trial ends in ${data.daysLeft} day${data.daysLeft !== 1 ? "s" : ""}</h2>
      <p style="color: #4A5750; font-size: 15px;">
        Hi ${data.userName}, the free trial for <strong>${data.orgName}</strong> ends soon.
        Add a payment method now to keep your leads, pipeline, and reminders running without interruption.
      </p>
      <p style="color: #4A5750; font-size: 14px;">
        Your plan after the trial: <strong>${data.currency}${data.amount.toLocaleString()}/month</strong>.
      </p>
      <a href="${data.appUrl}/billing" style="display: inline-block; margin-top: 16px; padding: 10px 20px; background: #1E2A22; color: #F3F0E6; text-decoration: none; border-radius: 3px; font-weight: 600;">
        Add payment method
      </a>
      <p style="color: #9AA39A; font-size: 12px; margin-top: 32px;">— Xsta360 · Manage. Follow Up. Close.</p>
    </div>
  `;

  await sendMail(data.to, subject, html);
}

export interface PaymentFailedEmailData {
  to: string;
  userName: string;
  orgName: string;
  amount: number;
  currency: string;
  graceDays: number;
  appUrl: string;
}

/** Dunning email when a recurring charge fails — gives a grace period. */
export async function sendPaymentFailedEmail(data: PaymentFailedEmailData): Promise<void> {
  const subject = "Payment failed — action needed to keep Xsta360 access";
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #B23A2E; font-family: 'IBM Plex Mono', monospace;">Payment failed</h2>
      <p style="color: #4A5750; font-size: 15px;">
        Hi ${data.userName}, we couldn't charge the card on file for <strong>${data.orgName}</strong>
        (${data.currency}${data.amount.toLocaleString()}).
      </p>
      <p style="color: #4A5750; font-size: 15px;">
        Your workspace keeps access for <strong>${data.graceDays} more days</strong> while we retry.
        Update your payment method to avoid losing access.
      </p>
      <a href="${data.appUrl}/billing" style="display: inline-block; margin-top: 16px; padding: 10px 20px; background: #1E2A22; color: #F3F0E6; text-decoration: none; border-radius: 3px; font-weight: 600;">
        Update payment method
      </a>
      <p style="color: #9AA39A; font-size: 12px; margin-top: 32px;">— Xsta360 · Manage. Follow Up. Close.</p>
    </div>
  `;

  await sendMail(data.to, subject, html);
}

export interface ReceiptEmailData {
  to: string;
  userName: string;
  orgName: string;
  planName: string;
  amount: number;
  currency: string;
  reference: string;
  memberCount: number;
  nextBillingDate: Date;
  appUrl: string;
}

/** Receipt after a successful charge. */
export async function sendReceiptEmail(data: ReceiptEmailData): Promise<void> {
  const subject = `Payment received — ${data.currency}${data.amount.toLocaleString()} for ${data.orgName}`;
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #2F7D5B; font-family: 'IBM Plex Mono', monospace;">Payment received</h2>
      <p style="color: #4A5750; font-size: 15px;">
        Hi ${data.userName}, thanks! We've received your payment for <strong>${data.orgName}</strong>.
      </p>
      <table style="width: 100%; font-size: 14px; color: #4A5750; margin: 16px 0; border-collapse: collapse;">
        <tr><td style="padding: 8px 0; border-bottom: 1px solid #E3DEC9;">Plan</td><td style="text-align: right; padding: 8px 0; border-bottom: 1px solid #E3DEC9;"><strong>${data.planName}</strong></td></tr>
        <tr><td style="padding: 8px 0; border-bottom: 1px solid #E3DEC9;">Members</td><td style="text-align: right; padding: 8px 0; border-bottom: 1px solid #E3DEC9;">${data.memberCount}</td></tr>
        <tr><td style="padding: 8px 0; border-bottom: 1px solid #E3DEC9;">Amount</td><td style="text-align: right; padding: 8px 0; border-bottom: 1px solid #E3DEC9;"><strong>${data.currency}${data.amount.toLocaleString()}</strong></td></tr>
        <tr><td style="padding: 8px 0; border-bottom: 1px solid #E3DEC9;">Reference</td><td style="text-align: right; padding: 8px 0; border-bottom: 1px solid #E3DEC9; font-family: monospace; font-size: 12px;">${data.reference}</td></tr>
        <tr><td style="padding: 8px 0;">Next billing</td><td style="text-align: right; padding: 8px 0;">${data.nextBillingDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</td></tr>
      </table>
      <a href="${data.appUrl}/billing" style="display: inline-block; margin-top: 8px; padding: 10px 20px; background: #1E2A22; color: #F3F0E6; text-decoration: none; border-radius: 3px; font-weight: 600;">
        View billing
      </a>
      <p style="color: #9AA39A; font-size: 12px; margin-top: 32px;">— Xsta360 · Manage. Follow Up. Close.</p>
    </div>
  `;

  await sendMail(data.to, subject, html);
}
