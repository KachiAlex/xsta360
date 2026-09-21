import type { Metadata } from "next";
import { LegalShell } from "@/components/app/legal-shell";

export const metadata: Metadata = {
  title: "Privacy Policy — Xsta360",
  description: "How Xsta360 collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="September 21, 2026">
      <section>
        <h2>1. Who we are</h2>
        <p>
          Xsta360 is a multi-tenant sales management application operated by Kreatix Technologies
          (&quot;we&quot;, &quot;us&quot;). It helps teams capture leads, log activity, manage
          pipelines, and send follow-up reminders. This policy explains what we collect, why, and
          the choices you have. Questions: <a href="mailto:privacy@kreatix.tech">privacy@kreatix.tech</a>.
        </p>
      </section>

      <section>
        <h2>2. What we collect</h2>
        <ul>
          <li><strong>Account data</strong> — name, email address, and a hashed password for each user.</li>
          <li><strong>Workspace data</strong> — your organization name, team members, roles, pipeline stages, and settings.</li>
          <li><strong>Lead data</strong> — names, phone numbers, email addresses, companies, notes, remarks, and activity history that you enter or import. You are the controller of this data; we process it on your behalf.</li>
          <li><strong>Billing data</strong> — subscription status and payment references. Card details are handled by Paystack and never touch our servers.</li>
          <li><strong>Voice input</strong> — audio you record with the dictate feature is sent to our server, transcribed to text, and not retained after transcription.</li>
          <li><strong>Usage data</strong> — audit events inside your workspace (logins, record changes) and standard server logs (IP address, browser, timestamps).</li>
          <li><strong>Integration credentials</strong> — if you connect WhatsApp Business, we store the phone number ID and access token needed to send messages on your behalf.</li>
        </ul>
      </section>

      <section>
        <h2>3. How we use it</h2>
        <ul>
          <li>Provide the service: store and display your leads, tasks, reminders, and pipeline.</li>
          <li>Send transactional messages you configure — reminder emails, sequence emails, and WhatsApp messages to your leads.</li>
          <li>Process subscription payments through Paystack.</li>
          <li>Keep the service secure: authentication, rate limiting, abuse prevention.</li>
          <li>We do not sell your data and we do not use your lead data to advertise.</li>
        </ul>
      </section>

      <section>
        <h2>4. Third-party processors</h2>
        <ul>
          <li><strong>Meta / WhatsApp Business Platform</strong> — sends WhatsApp messages you configure; subject to Meta&apos;s terms and the 24-hour messaging window rules.</li>
          <li><strong>Paystack</strong> — payment processing for subscriptions.</li>
          <li><strong>Brevo</strong> — transactional email delivery and engagement tracking (open/click pixels on sequence emails).</li>
          <li><strong>Cloudflare R2</strong> — document storage for files you upload.</li>
        </ul>
        <p>
          Each processor receives only the data needed to perform its function and is bound by its own
          privacy and security terms.
        </p>
      </section>

      <section>
        <h2>5. Cookies</h2>
        <p>
          We use a single httpOnly session cookie (<code>xsta_session</code>) to keep you signed in.
          It contains a signed token — not your password — and expires when you log out or after the
          session lifetime. We do not use advertising or cross-site tracking cookies.
        </p>
      </section>

      <section>
        <h2>6. Data retention and deletion</h2>
        <p>
          Workspace and lead data is retained while your account is active. Organization admins can
          delete leads, documents, and members at any time. To delete an entire workspace and all
          associated data, contact us at{" "}
          <a href="mailto:privacy@kreatix.tech">privacy@kreatix.tech</a> — we will erase it within
          30 days, except where retention is required by law (e.g. payment records).
        </p>
      </section>

      <section>
        <h2>7. Your rights</h2>
        <ul>
          <li>Access, correct, or export your data from within the app.</li>
          <li>Request deletion of your account or workspace.</li>
          <li>Withdraw a WhatsApp connection at any time from Settings.</li>
          <li>Leads you email through sequences can unsubscribe via the link in every message.</li>
        </ul>
      </section>

      <section>
        <h2>8. Security</h2>
        <p>
          Passwords are hashed with bcrypt, sessions use signed JWTs in httpOnly cookies, traffic is
          served over HTTPS, and every workspace&apos;s data is scoped by organization so tenants
          cannot see each other&apos;s records.
        </p>
      </section>

      <section>
        <h2>9. Changes</h2>
        <p>
          If we make material changes to this policy we will update the date above and, where
          appropriate, notify workspace admins by email.
        </p>
      </section>
    </LegalShell>
  );
}
