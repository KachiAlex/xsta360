"use client";

import { useEffect } from "react";
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

export function CardPublicView({ card }: CardPublicViewProps) {
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

            <Link href={`/api/contact-cards/${encodeURIComponent(card.slug)}/vcf`}>
              <Button className="w-full py-3 h-auto text-base font-semibold" size="lg">
                Save Contact
              </Button>
            </Link>
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
