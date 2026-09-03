"use client";

import { useEffect, useState, useRef } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createOrUpdateContactCard, type ContactCardFormState } from "@/app/actions/contact-cards";

interface SocialLink {
  label: string;
  url: string;
}

interface ContactCardManagerProps {
  card: {
    id?: string;
    slug?: string;
    displayName: string;
    title: string | null;
    role: string | null;
    company: string | null;
    website: string | null;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    photoUrl: string | null;
    socialLinks: Record<string, string>;
    qrCodeSvg: string | null;
    cardUrl: string;
    viewCount: number;
    leadCount: number;
  } | null;
}

export function ContactCardManager({ card }: ContactCardManagerProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ContactCardFormState, FormData>(
    createOrUpdateContactCard,
    {},
  );

  const [displayName, setDisplayName] = useState(card?.displayName ?? "");
  const [title, setTitle] = useState(card?.title ?? "");
  const [role, setRole] = useState(card?.role ?? "");
  const [company, setCompany] = useState(card?.company ?? "");
  const [website, setWebsite] = useState(card?.website ?? "");
  const [phone, setPhone] = useState(card?.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(card?.whatsapp ?? "");
  const [email, setEmail] = useState(card?.email ?? "");
  const [photoUrl, setPhotoUrl] = useState(card?.photoUrl ?? "");
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(() =>
    Object.entries(card?.socialLinks ?? {}).map(([label, url]) => ({ label, url })),
  );
  const [copied, setCopied] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      // Refresh server data so the public link, QR code, and stats appear.
      router.refresh();
    }
  }, [state, router]);

  const cardUrl = card?.cardUrl ?? "";
  const qrSvg = card?.qrCodeSvg ?? "";

  function addSocialLink() {
    setSocialLinks([...socialLinks, { label: "", url: "" }]);
  }

  function updateSocialLink(index: number, field: keyof SocialLink, value: string) {
    const next = [...socialLinks];
    next[index][field] = value;
    setSocialLinks(next);
  }

  function removeSocialLink(index: number) {
    setSocialLinks(socialLinks.filter((_, i) => i !== index));
  }

  function handleCopyLink() {
    if (!cardUrl) return;
    navigator.clipboard.writeText(cardUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setPhotoError("Please select an image file.");
      return;
    }

    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      setPhotoError("Image must be under 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoUrl(reader.result as string);
      setPhotoError(null);
    };
    reader.readAsDataURL(file);
  }

  function handleRemovePhoto() {
    setPhotoUrl("");
    setPhotoError(null);
  }

  function qrDataUrl(): string {
    if (!qrSvg) return "";
    const base64 = typeof window !== "undefined" ? btoa(unescape(encodeURIComponent(qrSvg))) : "";
    return `data:image/svg+xml;base64,${base64}`;
  }

  const socialLinksJson = JSON.stringify(
    Object.fromEntries(socialLinks.filter((s) => s.label.trim() && s.url.trim()).map((s) => [s.label.trim(), s.url.trim()])),
  );

  const isNew = !card?.id;
  const hasSlug = !!card?.slug;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Your contact card</h1>
          <p className="text-sm text-ink-soft mt-1">
            {hasSlug ? "Edit the details prospects see when they scan your card." : "Create a shareable card and QR code."}
          </p>
        </div>
        {hasSlug && (
          <div className="text-right">
            <Link
              href={`/c/${card.slug}`}
              target="_blank"
              className="text-sm text-ink hover:underline font-medium"
            >
              Preview public card →
            </Link>
          </div>
        )}
      </div>

      {state?.message && !state.ok && (
        <div className="rounded border border-stamp bg-stamp/10 px-4 py-3 text-sm text-stamp">
          {state.message}
        </div>
      )}

      <form ref={formRef} action={formAction} className="space-y-5">
        <input type="hidden" name="id" value={card?.id ?? ""} />
        <input type="hidden" name="socialLinks" value={socialLinksJson} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="displayName" className="block text-xs font-medium text-ink-soft mb-1">
              Display name *
            </label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink"
              placeholder="Tunde Bakare"
              required
            />
            {state?.errors?.displayName && (
              <p className="text-xs text-stamp mt-1">{state.errors.displayName[0]}</p>
            )}
          </div>

          <div>
            <label htmlFor="title" className="block text-xs font-medium text-ink-soft mb-1">
              Title
            </label>
            <input
              id="title"
              name="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink"
              placeholder="Sales Rep"
            />
          </div>

          <div>
            <label htmlFor="role" className="block text-xs font-medium text-ink-soft mb-1">
              Role
            </label>
            <input
              id="role"
              name="role"
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink"
              placeholder="Account Executive"
            />
          </div>

          <div>
            <label htmlFor="company" className="block text-xs font-medium text-ink-soft mb-1">
              Company
            </label>
            <input
              id="company"
              name="company"
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink"
              placeholder="Kreatix Technologies"
            />
          </div>

          <div>
            <label htmlFor="website" className="block text-xs font-medium text-ink-soft mb-1">
              Website
            </label>
            <input
              id="website"
              name="website"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink"
              placeholder="https://kreatix.com"
            />
            {state?.errors?.website && (
              <p className="text-xs text-stamp mt-1">{state.errors.website[0]}</p>
            )}
          </div>

          <div>
            <label htmlFor="email" className="block text-xs font-medium text-ink-soft mb-1">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink"
              placeholder="tunde@kreatix.com"
            />
            {state?.errors?.email && (
              <p className="text-xs text-stamp mt-1">{state.errors.email[0]}</p>
            )}
          </div>

          <div>
            <label htmlFor="phone" className="block text-xs font-medium text-ink-soft mb-1">
              Phone
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink"
              placeholder="+2348012345678"
            />
          </div>

          <div>
            <label htmlFor="whatsapp" className="block text-xs font-medium text-ink-soft mb-1">
              WhatsApp
            </label>
            <input
              id="whatsapp"
              name="whatsapp"
              type="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink"
              placeholder="+2348012345678"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-soft mb-2">Photo</label>
          <input type="hidden" name="photoUrl" value={photoUrl} />
          <div className="flex items-start gap-4">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt="Card preview"
                className="w-20 h-20 rounded-full border-2 border-white object-cover bg-paper-2 shadow"
              />
            ) : (
              <div className="w-20 h-20 rounded-full border-2 border-white bg-paper-2 flex items-center justify-center text-ink-soft text-xs shadow">
                No photo
              </div>
            )}
            <div className="flex-1">
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="block w-full text-sm text-ink file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-ink file:text-paper file:font-medium hover:file:bg-ink-soft"
              />
              {photoError && <p className="text-xs text-stamp mt-1">{photoError}</p>}
              <p className="text-xs text-ink-soft mt-1">JPEG/PNG under 2MB. Stored with the card.</p>
              {photoUrl && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="text-xs text-stamp hover:underline mt-2"
                >
                  Remove photo
                </button>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium text-ink-soft">Social links</label>
            <button
              type="button"
              onClick={addSocialLink}
              className="text-xs text-ink hover:underline font-medium"
            >
              + Add link
            </button>
          </div>
          <div className="space-y-2">
            {socialLinks.map((link, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={link.label}
                  onChange={(e) => updateSocialLink(index, "label", e.target.value)}
                  placeholder="LinkedIn"
                  className="w-1/3 rounded border border-rule bg-paper px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink"
                />
                <input
                  type="url"
                  value={link.url}
                  onChange={(e) => updateSocialLink(index, "url", e.target.value)}
                  placeholder="https://..."
                  className="flex-1 rounded border border-rule bg-paper px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink"
                />
                <button
                  type="button"
                  onClick={() => removeSocialLink(index)}
                  className="px-2 text-stamp hover:text-stamp-deep"
                  aria-label="Remove link"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-2">
          <Button type="submit" disabled={pending} className="w-full sm:w-auto px-8">
            {pending ? "Saving..." : isNew ? "Create card" : "Save changes"}
          </Button>
        </div>
      </form>

      {hasSlug && (
        <div className="border-t border-rule pt-6 space-y-4">
          <h2 className="font-bold text-ink">Share your card</h2>

          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="bg-white p-3 rounded border border-rule">
              {qrSvg ? (
                <div dangerouslySetInnerHTML={{ __html: qrSvg }} className="w-40 h-40" />
              ) : (
                <div className="w-40 h-40 bg-paper-2 flex items-center justify-center text-ink-soft text-sm">
                  Save to generate QR
                </div>
              )}
            </div>

            <div className="flex-1 space-y-3">
              <div>
                <p className="text-xs font-medium text-ink-soft uppercase tracking-wide mb-1">Public link</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={cardUrl}
                    className="flex-1 rounded border border-rule bg-paper px-3 py-2 text-sm text-ink"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-4 py-2 rounded border border-ink text-ink font-medium hover:bg-paper-2 transition-colors"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                {qrSvg && (
                  <a
                    href={qrDataUrl()}
                    download={`${card.slug}.svg`}
                    className="inline-flex items-center justify-center px-4 py-2 rounded bg-ink text-paper font-medium hover:bg-ink-soft transition-colors"
                  >
                    Download QR (SVG)
                  </a>
                )}
                <Link
                  href={`/c/${card.slug}`}
                  target="_blank"
                  className="inline-flex items-center justify-center px-4 py-2 rounded border border-ink text-ink font-medium hover:bg-paper-2 transition-colors"
                >
                  Open card
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="bg-paper rounded px-3 py-2">
                  <div className="text-2xl font-mono font-bold text-ink">{card?.viewCount ?? 0}</div>
                  <div className="text-xs text-ink-soft">Views</div>
                </div>
                <div className="bg-paper rounded px-3 py-2">
                  <div className="text-2xl font-mono font-bold text-ink">{card?.leadCount ?? 0}</div>
                  <div className="text-xs text-ink-soft">Leads</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
