import "server-only";

/**
 * Brevo v3 API — sender domain management.
 *
 * Used for per-org custom sender domains: a client org adds their domain,
 * Brevo returns DNS records (brevo code, DKIM, DMARC) for them to add at
 * their DNS host, and once Brevo marks the domain "authenticated" the app
 * can send sequence emails From: anything@clientdomain.com through our
 * shared Brevo SMTP account.
 *
 * Requires BREVO_API_KEY (v3 API key — NOT the same as the SMTP password).
 */

const API = "https://api.brevo.com/v3";

export interface BrevoDnsRecord {
  host_name: string;
  type: string;
  value: string;
  status: boolean;
}

export interface BrevoDomainRecords {
  brevo_code?: BrevoDnsRecord;
  dkim_record?: BrevoDnsRecord;
  dmarc_record?: BrevoDnsRecord;
}

export interface BrevoDomainInfo {
  verified: boolean;
  authenticated: boolean;
  records: BrevoDomainRecords;
}

export function brevoConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY);
}

async function brevoFetch(path: string, init?: RequestInit) {
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    throw new Error("Custom sender domains are not enabled on this server");
  }
  const res = await fetch(`${API}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "api-key": key,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (body as { message?: string })?.message ?? `Brevo API error (${res.status})`;
    throw new Error(msg);
  }
  return body;
}

/** Add a domain to the Brevo account; idempotent if it already exists. */
export async function createSenderDomain(domain: string): Promise<BrevoDomainInfo> {
  try {
    await brevoFetch("/senders/domains", {
      method: "POST",
      body: JSON.stringify({ name: domain }),
    });
  } catch (err) {
    // "Domain already exists in your account" — fine, just read its state.
    if (!(err instanceof Error && /already exists/i.test(err.message))) throw err;
  }
  return getSenderDomain(domain);
}

/** Fetch a domain's verification/authentication state + DNS records. */
export async function getSenderDomain(domain: string): Promise<BrevoDomainInfo> {
  const d = (await brevoFetch(
    `/senders/domains/${encodeURIComponent(domain)}`,
  )) as {
    verified?: boolean;
    authenticated?: boolean;
    dns_records?: BrevoDomainRecords;
  };
  return {
    verified: Boolean(d.verified),
    authenticated: Boolean(d.authenticated),
    records: d.dns_records ?? {},
  };
}

/** Ask Brevo to re-check the domain's DNS records now. */
export async function authenticateSenderDomain(domain: string): Promise<void> {
  await brevoFetch(`/senders/domains/${encodeURIComponent(domain)}/authenticate`, {
    method: "PUT",
  });
}

export async function deleteSenderDomain(domain: string): Promise<void> {
  await brevoFetch(`/senders/domains/${encodeURIComponent(domain)}`, {
    method: "DELETE",
  });
}
