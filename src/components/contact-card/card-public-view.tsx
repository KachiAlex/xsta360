"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface CardPublicViewProps {
  card: {
    id: string;
    slug: string;
    displayName: string;
    title: string | null;
    company: string | null;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    photoUrl: string | null;
    socialLinks: Record<string, string>;
    orgName: string;
  };
}

interface FormErrors {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
}

export function CardPublicView({ card }: CardPublicViewProps) {
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Fire-and-forget view log (public endpoint, no auth needed).
    fetch(`/api/contact-cards/${encodeURIComponent(card.slug)}/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceType: navigator.userAgent }),
    }).catch(() => {
      // ignore: analytics should not break the card page
    });
  }, [card.slug]);

  const company = card.company || card.orgName;

  function validate(field?: keyof typeof form): FormErrors {
    const next: FormErrors = {};
    if (field ? field === "name" : true) {
      if (!form.name.trim()) next.name = "Name is required";
    }
    if (field ? field === "email" : true) {
      if (!form.email.trim()) {
        next.email = "Email is required";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
        next.email = "Enter a valid email";
      }
    }
    if (field ? field === "phone" : true) {
      if (!form.phone.trim()) next.phone = "Phone is required";
    }
    return next;
  }

  function handleBlur(field: keyof typeof form) {
    setTouched((t) => ({ ...t, [field]: true }));
    setErrors((e) => ({ ...e, [field]: undefined }));
    const fieldErrors = validate(field);
    if (fieldErrors[field]) {
      setErrors((e) => ({ ...e, ...fieldErrors }));
    }
  }

  function handleChange(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    if (touched[field]) {
      setErrors((e) => ({ ...e, [field]: undefined }));
    }
  }

  const isValid =
    form.name.trim() &&
    form.email.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) &&
    form.phone.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const allErrors = validate();
    setErrors(allErrors);
    setTouched({ name: true, email: true, phone: true, company: true });
    if (Object.keys(allErrors).length > 0) return;

    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch(`/api/contact-cards/${encodeURIComponent(card.slug)}/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          company: form.company || undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; errors?: Record<string, string[]> };
      if (!res.ok || !data.ok) {
        setServerError(data.error || "Submission failed. Please try again.");
      } else {
        setSubmitted(true);
      }
    } catch {
      setServerError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <main className="min-h-full flex flex-col items-center justify-center p-6 bg-paper">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-rule p-8 text-center">
          <h1 className="text-2xl font-bold text-ink mb-2">Thanks, {form.name.split(" ")[0]}</h1>
          <p className="text-ink-soft">
            {card.displayName} will be in touch soon.
          </p>
          <div className="mt-6">
            <a
              href={`/api/contact-cards/${encodeURIComponent(card.slug)}/vcf`}
              download={`${card.slug}.vcf`}
              className="inline-block w-full py-3 px-4 rounded-lg bg-ink text-paper font-semibold hover:bg-ink-soft transition-colors"
            >
              Save {card.displayName.split(" ")[0]}'s Contact
            </a>
          </div>
          <div className="mt-8 text-center">
            <Link href="/" className="text-xs text-ink-soft hover:text-ink underline">
              Powered by Xsta360
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full flex flex-col items-center justify-center p-6 bg-paper">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-rule overflow-hidden">
        <div className="h-28 bg-ink" />
        <div className="px-6 pb-8 -mt-12">
          <div className="flex justify-center">
            {card.photoUrl ? (
              <img
                src={card.photoUrl}
                alt={card.displayName}
                className="w-24 h-24 rounded-full border-4 border-white object-cover bg-paper-2"
              />
            ) : (
              <div className="w-24 h-24 rounded-full border-4 border-white bg-paper-2 flex items-center justify-center text-2xl font-bold text-ink">
                {card.displayName
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </div>
            )}
          </div>

          <div className="text-center mt-4 mb-6">
            <h1 className="text-2xl font-bold text-ink">{card.displayName}</h1>
            {card.title && <p className="text-ink-soft font-medium">{card.title}</p>}
            <p className="text-ink-soft/80 text-sm mt-1">{company}</p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {card.phone && (
              <a
                href={`tel:${card.phone}`}
                className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-lg bg-paper-2 text-ink font-semibold hover:bg-paper transition-colors"
              >
                <span>Call</span>
                <span className="text-ink-soft text-sm">{card.phone}</span>
              </a>
            )}
            {card.whatsapp && (
              <a
                href={`https://wa.me/${card.whatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-lg bg-[#25D366] text-white font-semibold hover:opacity-90 transition-opacity"
              >
                <span>WhatsApp</span>
              </a>
            )}
            {card.email && (
              <a
                href={`mailto:${card.email}`}
                className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-lg bg-paper-2 text-ink font-semibold hover:bg-paper transition-colors"
              >
                <span>Email</span>
                <span className="text-ink-soft text-sm truncate max-w-[200px]">{card.email}</span>
              </a>
            )}

            <a
              href={`/api/contact-cards/${encodeURIComponent(card.slug)}/vcf`}
              download={`${card.slug}.vcf`}
              onClick={() => {
                setSaveMessage("vCard downloaded — open it to add this contact.");
                setTimeout(() => setSaveMessage(null), 5000);
              }}
              className="inline-flex items-center justify-center font-semibold rounded-[3px] border-[1.5px] border-ink cursor-pointer transition-[transform,background,color] duration-150 focus-visible:outline-[3px] focus-visible:outline-amber focus-visible:outline-offset-2 bg-ink text-paper hover:bg-stamp-deep hover:border-stamp-deep hover:-translate-y-px text-[15px] px-[26px] py-3.5 min-h-[52px] md:min-h-0 w-full py-3 h-auto text-base font-semibold"
            >
              Save Contact
            </a>
            {saveMessage && (
              <p className="text-center text-sm text-ink-soft">{saveMessage}</p>
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-rule">
            {!showForm ? (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="w-full text-center text-sm text-ink-soft hover:text-ink underline"
              >
                Share your info with {card.displayName.split(" ")[0]}
              </button>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-sm font-medium text-ink text-center">
                  Share your info with {card.displayName.split(" ")[0]}
                </p>
                <div>
                  <label htmlFor="name" className="block text-xs font-medium text-ink-soft mb-1">
                    Name *
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    value={form.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                    onBlur={() => handleBlur("name")}
                    className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink"
                    placeholder="Your name"
                  />
                  {errors.name && <p className="text-xs text-stamp mt-1">{errors.name}</p>}
                </div>
                <div>
                  <label htmlFor="email" className="block text-xs font-medium text-ink-soft mb-1">
                    Email *
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    onBlur={() => handleBlur("email")}
                    className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink"
                    placeholder="you@company.com"
                  />
                  {errors.email && <p className="text-xs text-stamp mt-1">{errors.email}</p>}
                </div>
                <div>
                  <label htmlFor="phone" className="block text-xs font-medium text-ink-soft mb-1">
                    Phone *
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => handleChange("phone", e.target.value)}
                    onBlur={() => handleBlur("phone")}
                    className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink"
                    placeholder="+234 ..."
                  />
                  {errors.phone && <p className="text-xs text-stamp mt-1">{errors.phone}</p>}
                </div>
                <div>
                  <label htmlFor="company" className="block text-xs font-medium text-ink-soft mb-1">
                    Company
                  </label>
                  <input
                    id="company"
                    name="company"
                    type="text"
                    value={form.company}
                    onChange={(e) => handleChange("company", e.target.value)}
                    className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink"
                    placeholder="Your company (optional)"
                  />
                </div>
                {serverError && (
                  <p className="text-sm text-stamp text-center">{serverError}</p>
                )}
                <Button
                  type="submit"
                  disabled={!isValid || submitting}
                  className="w-full py-3 h-auto text-base font-semibold"
                  size="lg"
                >
                  {submitting ? "Sending..." : "Send my info"}
                </Button>
              </form>
            )}
          </div>

          {Object.keys(card.socialLinks).length > 0 && (
            <div className="mt-6 pt-6 border-t border-rule">
              <p className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-3 text-center">
                Social
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {Object.entries(card.socialLinks).map(([label, url]) => (
                  <a
                    key={label}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-full border border-rule text-sm text-ink hover:bg-paper-2 transition-colors"
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 text-center">
            <Link href="/" className="text-xs text-ink-soft hover:text-ink underline">
              Powered by Xsta360
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
