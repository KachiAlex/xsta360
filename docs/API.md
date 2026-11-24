# Xsta360 Public API (v1)

Send emails and WhatsApp messages, manage contacts, and enroll contacts into
automated sequences from your own application (WooCommerce, Shopify, custom).

**Base URL:** `https://your-xsta360-host/api/v1`
**Auth:** `Authorization: Bearer xsta_live_…` (create keys in Settings → API & integrations)

API access is plan-gated (`api_access` feature). Keys are scoped:
`contacts:write`, `messages:send`, `sequences:enroll`, `read`.

## Rules that protect you

- **`consent: true` is required** on every send — you attest the recipient
  agreed to be contacted. Requests without it return `422`.
- **Opt-outs are enforced**: a contact who texted `STOP` or is otherwise
  opted out gets `422`. `START` re-opts them in.
- **WhatsApp free-form only inside the 24h window** — after a contact's last
  inbound message. Outside it, send an approved `template`.
- **Rate limits**: 60 requests/minute per key → `429`.
- **Quotas**: plan monthly/daily caps → `429`.
- **Idempotency**: pass `Idempotency-Key: <unique>` on POSTs — retries replay
  the stored response instead of double-sending. Keep keys stable per event
  (e.g. `order-123-created`).

## Endpoints

### Upsert a contact
```http
POST /api/v1/contacts
{ "name": "Ada Lovelace", "email": "ada@shop.com", "phone": "+2348012345678",
  "optIn": { "whatsapp": { "source": "woocommerce_checkout" } } }
```
→ `201 {"id","created",…}` · opt-out: `{"optOut": {"whatsapp": true, "email": true}}`

### Send an email
```http
POST /api/v1/messages/email
{ "to": "ada@shop.com", "subject": "Order confirmed",
  "html": "<p>Thanks for your order!</p>", "consent": true }
```
→ `200 {"id","status":"sent"}`

### Send a WhatsApp message
```http
POST /api/v1/messages/whatsapp
{ "to": "+2348012345678", "type": "template", "template": "order_update",
  "params": ["#1234", "₦45,000"], "consent": true }
```
→ `200 {"id","wamid","status":"sent"}`
Free-form: `{ "type": "text", "text": "…" }` — requires an inbound message from
the contact within 24h, else `422`.

### Enroll a contact in a sequence
```http
POST /api/v1/sequences/{sequenceId}/enroll
{ "contactId": "…" }
```
or `{ "contact": { "name", "phone", "optIn": {…} } }` — upserts then enrolls.

### Get message status
```http
GET /api/v1/messages/{reminderId-or-wamid}
```
→ `{"status":"sent|delivered|read|failed","lastError",…}`

## Outbound webhooks

Register an HTTPS URL in Settings → API & integrations. Events are POSTed as
JSON with headers `x-xsta-event`, `x-xsta-signature: sha256=<hmac>` —
verify with the secret shown at creation:

```text
signature = HMAC_SHA256(secret, "{deliveryId}.{timestamp}.{rawBody}")
```

Events: `message.sent`, `message.delivered`, `message.read`, `message.failed`,
`contact.replied`, `contact.opted_out`.

## WooCommerce recipe

Hook `woocommerce_new_order` → upsert the customer with
`optIn.whatsapp.source = "woocommerce_checkout"` → send the order
confirmation via `messages/email` and/or a `UTILITY` WhatsApp template
(order updates are utility, not marketing — cheaper and not frequency-capped).
A drop-in plugin is in `integrations/woocommerce/`.

**Only message customers who consented.** Purchased lists will burn your WABA
quality rating and can get your WhatsApp account restricted.
