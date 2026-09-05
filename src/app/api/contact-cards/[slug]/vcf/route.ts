import { NextRequest, NextResponse } from "next/server";
import { getContactCardBySlug } from "@/lib/contact-cards";
import { sendContactSavedEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  let card;
  try {
    card = await getContactCardBySlug(slug);
  } catch {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  const vcard = buildVCard(card);
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "https://xsta360.com.ng";

  // Notify the card owner that someone saved their contact.
  if (card.userEmail) {
    sendContactSavedEmail({
      to: card.userEmail,
      repName: card.displayName,
      cardName: card.displayName,
      cardUrl: `${appUrl}/c/${card.slug}`,
      appUrl,
    }).catch(() => {
      // Don't fail the download if the email fails.
    });
  }

  return new NextResponse(vcard, {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.vcf"`,
    },
  });
}

function escapeVCard(value: string): string {
  // vCard 3.0 escaping: backslashes, newlines, commas, semicolons, colons
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/:/g, "\\:");
}

function buildVCard(
  card: Awaited<ReturnType<typeof getContactCardBySlug>> & NonNullable<unknown>,
) {
  const company = card!.company || card!.orgName || "";
  const displayName = escapeVCard(card!.displayName.trim());
  const parts = card!.displayName.trim().split(/\s+/);
  const given = escapeVCard(parts[0] ?? "");
  const family = escapeVCard(parts.length > 1 ? parts[parts.length - 1] : "");

  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${displayName}`,
    `N:${family};${given};;;`,
    `ORG:${escapeVCard(company)}`,
  ];

  if (card!.title) lines.push(`TITLE:${escapeVCard(card!.title)}`);
  if (card!.role) lines.push(`ROLE:${escapeVCard(card!.role)}`);
  if (card!.phone) lines.push(`TEL;TYPE=CELL:${escapeVCard(card!.phone)}`);
  if (card!.email) lines.push(`EMAIL:${escapeVCard(card!.email)}`);

  const cardUrl = `${process.env.APP_URL?.replace(/\/$/, "") ?? "https://xsta360.com.ng"}/c/${card!.slug}`;
  const website = card!.website || cardUrl;
  lines.push(`URL:${escapeVCard(website)}`);

  Object.entries(card!.socialLinks).forEach(([label, url]) => {
    if (url) lines.push(`URL;TYPE=${escapeVCard(label)}:${escapeVCard(url)}`);
  });

  lines.push("END:VCARD");
  return lines.join("\n") + "\n";
}
