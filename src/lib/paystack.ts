/**
 * Paystack API client — handles transaction init, verification,
 * and recurring charges via saved authorization codes.
 *
 * Docs: https://paystack.com/docs/api/
 */

const BASE_URL = "https://api.paystack.co";

function getSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  return key;
}

function getPublicKey(): string {
  const key = process.env.PAYSTACK_PUBLIC_KEY;
  if (!key) throw new Error("PAYSTACK_PUBLIC_KEY is not set");
  return key;
}

export function paystackPublicKey(): string {
  return getPublicKey();
}

async function paystackFetch<T>(
  path: string,
  options: { method?: string; body?: Record<string, unknown> } = {},
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json();
  if (!data.status) {
    throw new Error(data.message || `Paystack API error: ${res.status}`);
  }
  return data.data as T;
}

// ---------------------------------------------------------------------------
// Transaction initialization & verification
// ---------------------------------------------------------------------------

export interface InitTransactionResponse {
  authorization_url: string;
  access_code: string;
  reference: string;
}

/**
 * Initialize a transaction for the current monthly bill.
 * Paystack will collect payment details and return an authorization code
 * that we can use for recurring charges.
 */
export async function initializeTransaction(params: {
  email: string;
  amount: number; // in kobo (₦1 = 100 kobo)
  reference: string;
  callback_url: string;
  metadata?: Record<string, unknown>;
}): Promise<InitTransactionResponse> {
  return paystackFetch<InitTransactionResponse>("/transaction/initialize", {
    method: "POST",
    body: {
      email: params.email,
      amount: params.amount,
      reference: params.reference,
      callback_url: params.callback_url,
      metadata: params.metadata,
      channels: ["card", "bank", "ussd", "bank_transfer"],
    },
  });
}

export interface VerifyTransactionResponse {
  id: number;
  domain: string;
  status: "success" | "failed" | "abandoned" | "pending";
  reference: string;
  amount: number;
  gateway_response: string;
  paid_at: string;
  created_at: string;
  channel: string;
  currency: string;
  ip_address: string;
  metadata: Record<string, unknown>;
  log: Record<string, unknown>;
  fees: number;
  fees_split: unknown;
  customer: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    customer_code: string;
    phone: string;
    metadata: unknown;
    risk_action: string;
  };
  authorization: {
    authorization_code: string;
    bin: string;
    last4: string;
    exp_month: string;
    exp_year: string;
    channel: string;
    card_type: string;
    bank: string;
    country_code: string;
    brand: string;
    reusable: boolean;
    signature: string;
    account_name: string;
  };
}

/**
 * Verify a transaction by reference. Returns the full transaction data
 * including the authorization code for recurring charges.
 */
export async function verifyTransaction(
  reference: string,
): Promise<VerifyTransactionResponse> {
  return paystackFetch<VerifyTransactionResponse>(
    `/transaction/verify/${reference}`,
  );
}

// ---------------------------------------------------------------------------
// Recurring charges (charge authorization)
// ---------------------------------------------------------------------------

export interface ChargeAuthorizationResponse {
  id: number;
  domain: string;
  status: "success" | "failed" | "pending";
  reference: string;
  amount: number;
  gateway_response: string;
  paid_at: string;
  created_at: string;
  channel: string;
  currency: string;
}

/**
 * Charge a saved authorization code for recurring billing.
 * Used by the monthly billing cron to charge active subscriptions.
 */
export async function chargeAuthorization(params: {
  authorizationCode: string;
  email: string;
  amount: number; // in kobo
  reference: string;
  metadata?: Record<string, unknown>;
}): Promise<ChargeAuthorizationResponse> {
  return paystackFetch<ChargeAuthorizationResponse>("/transaction/charge_authorization", {
    method: "POST",
    body: {
      authorization_code: params.authorizationCode,
      email: params.email,
      amount: params.amount,
      reference: params.reference,
      metadata: params.metadata,
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert naira to kobo (Paystack requires amounts in kobo). */
export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}

/** Generate a unique transaction reference. */
export function generateReference(prefix = "xsta"): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${ts}_${rand}`;
}
