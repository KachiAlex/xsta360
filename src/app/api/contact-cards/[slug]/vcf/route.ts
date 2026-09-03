import { NextRequest, NextResponse } from "next/server";
import { getContactCardBySlug } from "@/lib/contact-cards";
import { sendContactSavedEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const card = await getContactCardBySlug(slug);

  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  const vcard = buildVCard(card);
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "https://xsta360.67-211-210-8.sslip.io";

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

function buildVCard(
  card: Awaited<ReturnType<typeof getContactCardBySlug>> & NonNullable<unknown>,
) {
  const company = card!.company || card!.orgName;
  const parts = card!.displayName.trim().split(/\s+/);
  const given = parts[0] ?? "";
  const family = parts.length > 1 ? parts[parts.length - 1] : "";

  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${card!.displayName}`,
    `N:${family};${given};;;`,
    `ORG:${company}`,
  ];

  if (card!.title) lines.push(`TITLE:${card!.title}`);
  if (card!.phone) lines.push(`TEL;TYPE=CELL:${card!.phone}`);
  if (card!.email) lines.push(`EMAIL:${card!.email}`);

  const cardUrl = `${process.env.APP_URL?.replace(/\/$/, "") ?? "https://xsta360.67-211-210-8.sslip.io"}/c/${card!.slug}`;
  lines.push(`URL:${cardUrl}`);

  Object.entries(card!.socialLinks).forEach(([label, url]) => {
    if (url) lines.push(`URL;${label}:${url}`);
  });

  lines.push("END:VCARD");
  return lines.join("\n") + "\n";
}
