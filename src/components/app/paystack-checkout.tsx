"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function BillingContent() {
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // If we have a reference in the URL, we're returning from Paystack — verify.
  useEffect(() => {
    if (reference) {
      setVerifying(true);
      setMessage({ type: "info", text: "Verifying your payment..." });
      fetch("/api/billing/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (res.ok && data.success) {
            setMessage({ type: "success", text: "Payment successful! Your subscription is now active." });
          } else {
            setMessage({ type: "error", text: data.error || "Payment verification failed." });
          }
        })
        .catch(() => {
          setMessage({ type: "error", text: "Failed to verify payment. Please contact support." });
        })
        .finally(() => setVerifying(false));
    }
  }, [reference]);

  async function handlePay() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/billing/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.authorization_url) {
        // Redirect to Paystack checkout.
        window.location.href = data.authorization_url;
      } else {
        setMessage({ type: "error", text: data.error || "Failed to initialize payment." });
      }
    } catch {
      setMessage({ type: "error", text: "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {message && (
        <div
          className={`px-4 py-3 rounded-md text-sm font-medium ${
            message.type === "success"
              ? "bg-register/10 text-register border border-register/20"
              : message.type === "error"
                ? "bg-stamp/10 text-stamp border border-stamp/20"
                : "bg-amber/10 text-[#9c6014] border border-amber/20"
          }`}
        >
          {message.text}
        </div>
      )}

      {verifying ? (
        <div className="flex items-center justify-center py-12">
          <div className="font-mono text-sm text-ink-soft animate-pulse">Verifying payment...</div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handlePay}
          disabled={loading}
          className="w-full sm:w-auto text-sm font-semibold bg-ink text-paper border border-ink rounded-md px-6 py-3 min-h-[48px] hover:bg-ink/90 active:bg-ink/90 disabled:opacity-50 transition-colors"
        >
          {loading ? "Redirecting to Paystack..." : "Pay with Paystack"}
        </button>
      )}
    </div>
  );
}

export function PaystackCheckout() {
  return (
    <Suspense fallback={<div className="text-sm text-ink-soft">Loading...</div>}>
      <BillingContent />
    </Suspense>
  );
}
