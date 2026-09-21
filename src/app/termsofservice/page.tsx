import type { Metadata } from "next";
import { LegalShell } from "@/components/app/legal-shell";

export const metadata: Metadata = {
  title: "Terms of Service — Xsta360",
  description: "The terms that govern your use of Xsta360.",
};

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="September 21, 2026">
      <section>
        <h2>1. The service</h2>
        <p>
          Xsta360 is a subscription sales-management application operated by Kreatix Technologies.
          It provides lead capture, remarks, follow-up reminders, pipeline boards, reporting,
          email/WhatsApp sequences, and team management. By creating an account or using the service
          you agree to these terms.
        </p>
      </section>

      <section>
        <h2>2. Accounts and workspaces</h2>
        <ul>
          <li>Each organization gets an isolated workspace; workspace admins control membership and roles.</li>
          <li>You are responsible for the accuracy of your account information and for keeping your credentials confidential.</li>
          <li>You must be authorized to add lead data — including phone numbers and email addresses — to your workspace.</li>
        </ul>
      </section>

      <section>
        <h2>3. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Send spam, unsolicited bulk messages, or messages to recipients who have not consented.</li>
          <li>Violate the WhatsApp Business Messaging Policy or Meta Platform Terms when using WhatsApp features.</li>
          <li>Upload unlawful, harmful, or infringing content.</li>
          <li>Attempt to access another organization&apos;s data, probe the service for vulnerabilities, or interfere with its operation.</li>
          <li>Resell or sublicense access to the service without our written consent.</li>
        </ul>
        <p>We may suspend workspaces that violate these rules, with notice where practicable.</p>
      </section>

      <section>
        <h2>4. Messaging compliance</h2>
        <p>
          Sequence emails include an unsubscribe link and honor opt-outs. For WhatsApp, Meta only
          permits free-form messages to contacts who messaged you within the prior 24 hours; starting
          a new conversation requires a Meta-approved message template. You are responsible for having
          a lawful basis and any required consent before messaging a lead, and for honoring opt-out
          requests promptly.
        </p>
      </section>

      <section>
        <h2>5. Billing</h2>
        <ul>
          <li>Subscriptions are billed monthly in Nigerian Naira via Paystack: a base fee plus a per-seat fee for additional members.</li>
          <li>New workspaces receive a free trial; continued use after the trial requires a paid subscription.</li>
          <li>Failed renewals enter a grace period before the workspace is suspended; data is not deleted on suspension.</li>
          <li>You can cancel at any time from the billing page — access continues until the end of the paid period. Fees are non-refundable except where required by law.</li>
        </ul>
      </section>

      <section>
        <h2>6. Your data</h2>
        <ul>
          <li>You retain ownership of your workspace data. We process it only to provide the service (see the <a href="/privacy">Privacy Policy</a>).</li>
          <li>You can export or delete your data, and request full workspace deletion by contacting us.</li>
          <li>We may use aggregated, de-identified usage statistics to improve the service.</li>
        </ul>
      </section>

      <section>
        <h2>7. Availability and changes</h2>
        <p>
          We aim for high availability but do not guarantee uninterrupted service. We may update
          features, these terms, or pricing with reasonable notice; material pricing changes apply
          only from the next billing cycle.
        </p>
      </section>

      <section>
        <h2>8. Liability</h2>
        <p>
          The service is provided &quot;as is&quot;. To the maximum extent permitted by law, Kreatix
          Technologies is not liable for indirect or consequential losses, lost profits, or lost data
          arising from use of the service. Our aggregate liability is limited to the fees you paid in
          the three months preceding the claim.
        </p>
      </section>

      <section>
        <h2>9. Governing law and contact</h2>
        <p>
          These terms are governed by the laws of the Federal Republic of Nigeria. Questions:{" "}
          <a href="mailto:support@kreatix.tech">support@kreatix.tech</a>.
        </p>
      </section>
    </LegalShell>
  );
}
