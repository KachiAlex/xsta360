import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { Logo } from "@/components/app/logo";
import { SiteFooter } from "@/components/app/site-footer";
import { CodeBlock } from "@/components/app/code-block";

export const metadata: Metadata = {
  title: "API Documentation — Xsta360",
  description:
    "Send emails and WhatsApp messages, manage contacts, and enroll contacts into automated sequences from your own application.",
};

const TOC = [
  { id: "getting-started", label: "1. Get your API key" },
  { id: "auth", label: "2. Authentication" },
  { id: "quickstart", label: "3. Quickstart" },
  { id: "endpoints", label: "4. Endpoints" },
  { id: "consent", label: "5. Consent & safety rules" },
  { id: "idempotency", label: "6. Idempotency" },
  { id: "webhooks", label: "7. Outbound webhooks" },
  { id: "errors", label: "8. Error codes" },
  { id: "woocommerce", label: "9. WooCommerce" },
  { id: "examples", label: "10. Full examples" },
];

export default async function ApiDocsPage() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "your-xsta360-host";
  const baseUrl = `${proto}://${host}/api/v1`;

  return (
    <>
      <nav className="sticky top-0 z-50 flex items-center justify-between px-5 sm:px-12 py-4 sm:py-5 bg-paper/92 backdrop-blur-[6px] border-b border-rule">
        <Logo size="lg" />
        <div className="flex gap-3 items-center text-sm">
          <Link href="/login" className="btn btn-ghost font-semibold text-sm px-3 sm:px-5 py-2 sm:py-2.5 rounded-[3px] border-[1.5px] border-ink bg-transparent text-ink hover:bg-paper-2 min-h-[40px] flex items-center">Sign in</Link>
          <Link href="/signup" className="btn btn-primary font-semibold text-sm px-3 sm:px-5 py-2 sm:py-2.5 rounded-[3px] border-[1.5px] border-ink bg-ink text-paper hover:bg-stamp-deep hover:border-stamp-deep min-h-[40px] flex items-center">Start free</Link>
        </div>
      </nav>

      <main className="max-w-[860px] mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <h1 className="font-mono text-3xl sm:text-4xl font-bold m-0 mb-3">Xsta360 API</h1>
        <p className="text-[15px] leading-relaxed text-ink-soft mb-2 m-0">
          Send emails and WhatsApp messages, manage contacts, and enroll contacts into
          automated sequences from your own application — WooCommerce, Shopify, a custom
          backend, or anything that can make an HTTPS request.
        </p>
        <p className="text-[15px] leading-relaxed text-ink-soft m-0">
          Base URL: <code className="font-mono bg-paper-2 px-1.5 py-0.5 rounded text-[13px]">{baseUrl}</code>
        </p>

        {/* Table of contents */}
        <div className="border border-rule rounded-[4px] bg-paper-2/50 px-4 py-3.5 mt-8 mb-12">
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-soft mb-2">On this page</div>
          <ol className="m-0 pl-0 space-y-1 list-none">
            {TOC.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} className="text-sm text-stamp hover:underline underline-offset-2">{t.label}</a>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-14 text-[15px] leading-relaxed text-ink-soft [&_h2]:font-mono [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink [&_h2]:m-0 [&_h2]:mb-3 [&_h2]:scroll-mt-24 [&_h3]:font-mono [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-ink [&_h3]:m-0 [&_h3]:mb-2 [&_h3]:mt-6 [&_p]:m-0 [&_p]:mb-3 [&_ul]:m-0 [&_ul]:mb-3 [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_li]:list-disc [&_a]:text-stamp [&_a]:underline [&_a]:underline-offset-2 [&_code]:font-mono [&_code]:bg-paper-2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[13px] [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit">

          {/* 1 — Getting started */}
          <section>
            <h2 id="getting-started">1. Get your API key</h2>
            <p>
              API keys are created inside your workspace and are tied to your organization —
              every request you make acts on <em>your</em> contacts, quotas, and connected
              WhatsApp/email accounts.
            </p>
            <ul>
              <li>Sign in → <strong>Settings → API &amp; integrations</strong> (admin only).</li>
              <li>Click <strong>Create key</strong>, give it a name (e.g. <em>&quot;WooCommerce store&quot;</em>), and pick the <strong>scopes</strong> it needs — grant only what the integration uses.</li>
              <li>Copy the key immediately. It&apos;s shown <strong>once</strong> — we only store a hash, so it can&apos;t be recovered later.</li>
            </ul>
            <p>
              Scopes: <code>contacts:write</code> (upsert contacts), <code>messages:send</code>{" "}
              (email + WhatsApp), <code>sequences:enroll</code> (enroll contacts into sequences),{" "}
              <code>read</code> (message status lookups).
            </p>
            <p>
              API access is plan-gated. If keys are rejected with <code>403 api_access_required</code>,
              your plan doesn&apos;t include API access — upgrade or contact support.
            </p>
          </section>

          {/* 2 — Auth */}
          <section>
            <h2 id="auth">2. Authentication</h2>
            <p>Send the key as a Bearer token on every request:</p>
            <CodeBlock lang="http" code={`Authorization: Bearer xsta_live_xxxxxxxxxxxxxxxx\nContent-Type: application/json`} />
            <p>
              Keep keys in your server-side environment variables — never ship them in a
              browser, mobile app, or public repository. If a key leaks, revoke it in
              Settings and create a new one.
            </p>
          </section>

          {/* 3 — Quickstart */}
          <section>
            <h2 id="quickstart">3. Quickstart — your first request</h2>
            <p>
              The most common pattern: upsert a contact, then send them a message.
              Here&apos;s a contact upsert:
            </p>
            <CodeBlock
              lang="bash"
              code={`curl -X POST ${baseUrl}/contacts \\
  -H "Authorization: Bearer xsta_live_xxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: customer-42-upsert" \\
  -d '{
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "phone": "+2348012345678",
    "optIn": { "whatsapp": { "source": "woocommerce_checkout" } }
  }'`}
            />
            <p>
              → <code>201</code> with <code>{`{"id": "…", "created": true}`}</code>. Re-POSTing the
              same email/phone updates the existing contact instead of duplicating it.
            </p>
          </section>

          {/* 4 — Endpoints */}
          <section>
            <h2 id="endpoints">4. Endpoints</h2>

            <h3>POST /contacts — upsert a contact</h3>
            <CodeBlock
              lang="json"
              code={`{
  "name": "Ada Lovelace",
  "email": "ada@example.com",        // optional if phone given
  "phone": "+2348012345678",         // optional if email given (E.164 preferred)
  "company": "Example Ltd",          // optional
  "optIn": {
    "whatsapp": { "source": "woocommerce_checkout", "at": "2026-01-15T10:00:00Z" },
    "email":    { "source": "checkout_checkbox" }
  },
  "optOut": { "whatsapp": true }      // set true to record an opt-out instead
}`}
            />
            <p>
              → <code>201</code> <code>{`{"id","created","optedOut":{…}}`}</code>.{" "}
              <strong>Scope:</strong> <code>contacts:write</code>. The <code>optIn.source</code> you
              record is your consent evidence — keep it accurate (e.g.{" "}
              <code>woocommerce_checkout</code>, <code>signup_form</code>, <code>manual</code>).
            </p>

            <h3>POST /messages/email — send an email</h3>
            <CodeBlock
              lang="json"
              code={`{
  "to": "ada@example.com",           // email address, or a contactId (UUID)
  "subject": "Order confirmed #1234",
  "html": "<p>Thanks for your order!</p>",
  "text": "Thanks for your order!",  // optional plaintext fallback
  "consent": true                     // REQUIRED — see section 5
}`}
            />
            <p>
              → <code>200</code> <code>{`{"id","status":"sent"}`}</code>.{" "}
              <strong>Scope:</strong> <code>messages:send</code>. Emails to unsubscribed contacts
              are rejected with <code>422</code>.
            </p>

            <h3>POST /messages/whatsapp — send a WhatsApp message</h3>
            <CodeBlock
              lang="json"
              code={`// Template message (always allowed, incl. outside the 24h window):
{
  "to": "+2348012345678",            // phone or contactId (UUID)
  "type": "template",
  "template": "order_update",         // approved template name on your WABA
  "language": "en_US",                // optional, default en_US
  "params": ["#1234", "₦45,000"],     // body variables in order
  "consent": true
}

// Free-form text (ONLY inside the 24h customer-service window):
{
  "to": "+2348012345678",
  "type": "text",
  "text": "Your order is on its way!",
  "consent": true
}`}
            />
            <p>
              → <code>200</code> <code>{`{"id","wamid","status":"sent"}`}</code>.{" "}
              <strong>Scope:</strong> <code>messages:send</code>. Free-form sends outside the 24h
              window (counted from the contact&apos;s last inbound message) return{" "}
              <code>422 outside_24h_window</code> — use a template instead.
            </p>

            <h3>POST /sequences/{"{id}"}/enroll — enroll a contact in a sequence</h3>
            <CodeBlock
              lang="json"
              code={`// By existing contact:
{ "contactId": "3f2c…", "consent": true }

// Or upsert + enroll in one call:
{
  "contact": {
    "name": "Ada Lovelace",
    "phone": "+2348012345678",
    "optIn": { "whatsapp": { "source": "api" } }
  },
  "consent": true
}`}
            />
            <p>
              → <code>200</code> <code>{`{"enrollmentId","status":"active"}`}</code>.{" "}
              <strong>Scope:</strong> <code>sequences:enroll</code>. Find the sequence ID in the
              app URL: <code>/sequences/{"{id}"}</code>.
            </p>

            <h3>GET /messages/{"{id}"} — check delivery status</h3>
            <CodeBlock
              lang="bash"
              code={`curl ${baseUrl}/messages/REMINDER_ID_OR_WAMID \\
  -H "Authorization: Bearer xsta_live_xxxxxxxxxxxxxxxx"`}
            />
            <p>
              → <code>{`{"id","channel","status","lastError",…}`}</code>. Accepts our message ID
              (from send responses) or a Meta <code>wamid</code>. Status:{" "}
              <code>sent | delivered | read | failed</code>. <strong>Scope:</strong>{" "}
              <code>read</code>.
            </p>
          </section>

          {/* 5 — Consent */}
          <section>
            <h2 id="consent">5. Consent &amp; safety rules — read before sending</h2>
            <p>
              WhatsApp and email providers actively punish unsolicited messaging. These rules
              protect your sender reputation — and are enforced server-side, not optional:
            </p>
            <ul>
              <li>
                <strong><code>consent: true</code> is required on every send.</strong> You attest
                that the recipient agreed to be contacted (checkout opt-in, signup form, inbound
                message, verbal + logged, …). Requests without it return{" "}
                <code>422 consent_required</code>.
              </li>
              <li>
                <strong>Opt-outs are enforced everywhere.</strong> A contact who texts{" "}
                <code>STOP</code> (or <code>unsubscribe</code>, <code>cancel</code>,…) is opted
                out of WhatsApp automatically; sends to them return{" "}
                <code>422 opted_out</code>. <code>START</code> opts them back in. Email
                unsubscribe links work the same way for email.
              </li>
              <li>
                <strong>The 24h WhatsApp window.</strong> Business-initiated free-form messages are
                only allowed within 24h of the customer&apos;s last inbound message. Outside that
                window you must use a Meta-approved template.
              </li>
              <li>
                <strong>Utility vs marketing templates.</strong> Order confirmations, shipping
                updates, and receipts are <em>utility</em> — cheaper per message and not
                frequency-capped. Promotions are <em>marketing</em> — more expensive and capped
                per recipient by Meta. Classify your templates honestly; miscategorized marketing
                templates get flagged.
              </li>
              <li>
                <strong>Rate limits &amp; quotas.</strong> 60 requests/minute per API key →{" "}
                <code>429</code>. Plan monthly/daily send caps → <code>429</code> with a{" "}
                <code>quota</code> error code.
              </li>
              <li>
                <strong>Circuit breaker.</strong> If ≥40% of your WhatsApp sends fail within 24h
                (bad numbers, template rejections), sends pause automatically to protect your
                WABA quality rating — fix the list quality, then sending resumes.
              </li>
            </ul>
            <p>
              <strong>Never message purchased or scraped lists.</strong> Meta tracks
              report/block rates per WABA — a spammy list will degrade your quality rating
              (green → yellow → red) and can get your WhatsApp number restricted or banned.
            </p>
          </section>

          {/* 6 — Idempotency */}
          <section>
            <h2 id="idempotency">6. Idempotency — safe retries</h2>
            <p>
              E-commerce platforms retry webhooks aggressively. Without protection, a retry after
              a timeout could message a customer twice. Pass a stable unique key per logical
              operation:
            </p>
            <CodeBlock lang="http" code={`Idempotency-Key: order-1234-confirmation`} />
            <p>
              Replays within 24h return the <em>stored</em> response without re-sending. Good key
              choices: <code>{"{order_id}"}-created</code>, <code>{"{cart_id}"}-abandoned</code>. If
              a request fails with a network error, retry with the same key — never mint a new
              one for the same logical send.
            </p>
          </section>

          {/* 7 — Webhooks */}
          <section>
            <h2 id="webhooks">7. Outbound webhooks — get notified</h2>
            <p>
              Register an HTTPS URL in <strong>Settings → API &amp; integrations</strong> and pick
              events. We POST JSON to it with a signature you should verify:
            </p>
            <ul>
              <li><code>message.sent</code>, <code>message.delivered</code>, <code>message.read</code>, <code>message.failed</code></li>
              <li><code>contact.replied</code> — a lead sent you an inbound WhatsApp message</li>
              <li><code>contact.opted_out</code> — a contact opted out (STOP / unsubscribe)</li>
            </ul>
            <p>Headers on each delivery:</p>
            <CodeBlock
              lang="http"
              code={`x-xsta-event: message.delivered
x-xsta-delivery: d4f1…           // unique delivery id (dedupe on this)
x-xsta-timestamp: 1736956800
x-xsta-signature: sha256=<hmac>`}
            />
            <p>
              The signing secret is shown <strong>once</strong> when you create the webhook.
              Compute:
            </p>
            <CodeBlock
              lang="text"
              code={`expected = "sha256=" + HMAC_SHA256(secret, deliveryId + "." + timestamp + "." + rawBody)`}
            />
            <p>Verify in Node.js:</p>
            <CodeBlock
              lang="js"
              code={`const crypto = require("crypto");

function verifyXstaSignature(req, secret) {
  const sig = req.headers["x-xsta-signature"];
  const base = \`\${req.headers["x-xsta-delivery"]}.\${req.headers["x-xsta-timestamp"]}.\${req.rawBody}\`;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(base).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig ?? ""), Buffer.from(expected));
}`}
            />
            <p>
              Only HTTPS URLs on public hosts are accepted — we block localhost and private IPs.
              If delivery fails, the webhook row in Settings shows the last error.
            </p>
          </section>

          {/* 8 — Errors */}
          <section>
            <h2 id="errors">8. Error codes</h2>
            <div className="border border-rule rounded-[4px] overflow-x-auto my-3">
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr className="bg-paper-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft">
                    <th className="px-3 py-2">HTTP</th>
                    <th className="px-3 py-2">Code</th>
                    <th className="px-3 py-2">Meaning / fix</th>
                  </tr>
                </thead>
                <tbody className="[&_td]:px-3 [&_td]:py-2 [&_td]:border-t [&_td]:border-rule [&_td]:align-top">
                  <tr><td>401</td><td><code>unauthorized</code></td><td>Missing/invalid/revoked key.</td></tr>
                  <tr><td>403</td><td><code>forbidden_scope</code></td><td>Key lacks the required scope — recreate it with the right scopes.</td></tr>
                  <tr><td>403</td><td><code>api_access_required</code></td><td>Plan doesn&apos;t include API access — upgrade.</td></tr>
                  <tr><td>422</td><td><code>consent_required</code></td><td>Send without <code>consent: true</code>.</td></tr>
                  <tr><td>422</td><td><code>opted_out</code></td><td>Recipient opted out of that channel — do not retry.</td></tr>
                  <tr><td>422</td><td><code>outside_24h_window</code></td><td>Free-form WhatsApp outside the window — use a template.</td></tr>
                  <tr><td>422</td><td><code>no_whatsapp_config</code> / <code>no_email_config</code></td><td>Channel not connected — complete setup in the app first.</td></tr>
                  <tr><td>422</td><td><code>validation</code></td><td>Bad payload — the <code>details</code> field lists what&apos;s wrong.</td></tr>
                  <tr><td>429</td><td><code>rate_limited</code></td><td>&gt;60 req/min per key — back off and retry.</td></tr>
                  <tr><td>429</td><td><code>quota_exceeded</code></td><td>Plan monthly/daily cap hit — resumes next period or on upgrade.</td></tr>
                  <tr><td>503</td><td><code>circuit_open</code></td><td>Too many recent WhatsApp failures — sends paused to protect WABA quality.</td></tr>
                </tbody>
              </table>
            </div>
            <p>
              Errors always return JSON: <code>{`{"error": "human message", "code": "…"}`}</code>.
            </p>
          </section>

          {/* 9 — WooCommerce */}
          <section>
            <h2 id="woocommerce">9. WooCommerce integration</h2>
            <p>
              We ship a drop-in WordPress plugin that wires orders to Xsta360: on a new order it
              upserts the customer (recording checkout opt-in), sends a confirmation email, and —
              if the customer opted in — fires a WhatsApp utility template.
            </p>
            <ul>
              <li>Get the plugin file <code>xsta360-woocommerce.php</code> from our team or your integration package.</li>
              <li>Drop it in <code>wp-content/plugins/</code>, fill in your base URL + API key at the top, activate.</li>
              <li>Orders then flow automatically — no code needed.</li>
            </ul>
            <p>
              Rolling your own instead? Hook <code>woocommerce_new_order</code> and make two calls —
              upsert the customer with <code>optIn.whatsapp.source = &quot;woocommerce_checkout&quot;</code>,
              then send via <code>/messages/email</code> and/or a <em>utility</em> WhatsApp
              template. See the PHP example below.
            </p>
          </section>

          {/* 10 — Examples */}
          <section>
            <h2 id="examples">10. Full examples</h2>

            <h3>JavaScript / Node.js — new order → upsert + WhatsApp + email</h3>
            <CodeBlock
              lang="js"
              code={`const BASE = "${baseUrl}";
const KEY = process.env.XSTA_API_KEY; // xsta_live_…

async function xsta(path, body, idemKey) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${KEY}\`,
      "Content-Type": "application/json",
      ...(idemKey ? { "Idempotency-Key": idemKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(\`\${res.status} \${data.code}: \${data.error}\`);
  return data;
}

export async function onNewOrder(order) {
  // 1. Upsert the customer (records checkout opt-in as evidence)
  const { id: contactId } = await xsta("/contacts", {
    name: order.customer_name,
    email: order.customer_email,
    phone: order.customer_phone,
    optIn: order.marketing_optin
      ? { whatsapp: { source: "woocommerce_checkout" } }
      : undefined,
  }, \`\${order.id}-upsert\`);

  // 2. Email receipt
  await xsta("/messages/email", {
    to: order.customer_email,
    subject: \`Order confirmed #\${order.number}\`,
    html: \`<p>Thanks! Order <b>#\${order.number}</b> (₦\${order.total}) is being processed.</p>\`,
    consent: true,
  }, \`\${order.id}-email\`);

  // 3. WhatsApp update via UTILITY template — only if they opted in
  if (order.marketing_optin) {
    await xsta("/messages/whatsapp", {
      to: contactId,
      type: "template",
      template: "order_update",        // your approved template name
      params: [String(order.number), \`₦\${order.total}\`],
      consent: true,
    }, \`\${order.id}-wa\`);
  }
}`}
            />

            <h3>PHP / WordPress — same flow with wp_remote_post</h3>
            <CodeBlock
              lang="php"
              code={`function xsta_post($path, $body, $idem = null) {
  $headers = array(
    'Authorization' => 'Bearer ' . XSTA_API_KEY,
    'Content-Type'  => 'application/json',
  );
  if ($idem) $headers['Idempotency-Key'] = $idem;
  $res = wp_remote_post(XSTA_BASE . $path, array(
    'headers' => $headers,
    'body'    => wp_json_encode($body),
    'timeout' => 15,
  ));
  return json_decode(wp_remote_retrieve_body($res), true);
}

add_action('woocommerce_new_order', function ($order_id) {
  $o = wc_get_order($order_id);
  xsta_post('/contacts', array(
    'name'  => $o->get_billing_first_name() . ' ' . $o->get_billing_last_name(),
    'email' => $o->get_billing_email(),
    'phone' => $o->get_billing_phone(),
    'optIn' => array('whatsapp' => array('source' => 'woocommerce_checkout')),
  ), "order-$order_id-upsert");

  xsta_post('/messages/email', array(
    'to'      => $o->get_billing_email(),
    'subject' => 'Order confirmed #' . $o->get_order_number(),
    'html'    => '<p>Thanks for your order!</p>',
    'consent' => true,
  ), "order-$order_id-email");
});`}
            />
          </section>

          <section className="border border-rule rounded-[4px] bg-paper-2/50 px-4 py-3.5">
            <p className="m-0 text-sm">
              <strong>Need help integrating?</strong> Share this page with your developer, or
              contact support — we can help map your platform&apos;s events (orders, carts,
              tickets) to the right API calls.
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
