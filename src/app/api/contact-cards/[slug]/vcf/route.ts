import { NextRequest, NextResponse } from "next/server";
import { getContactCardBySlug } from "@/lib/contact-cards";

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

  return new NextResponse(vcard, {
    headers: {
      "Content-Type": "text/vcard",
      "Content-Disposition": `attachment; filename="${slug}.vcf"`,
    },
  });
}

function buildVCard(
  card: Awaited<ReturnType<typeof getContactCardBySlug>> & NonNullable<unknown>,
) {
  const company = card!.company || card!.orgName;
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${card!.displayName}`,
    `ORG:${company}`,
  ];

  if (card!.title) lines.push(`TITLE:${card!.title}`);
  if (card!.phone) lines.push(`TEL;TYPE=CELL:${card!.phone}`);
  if (card!.email) lines.push(`EMAIL:${card!.email}`);

  const cardUrl = `${process.env.APP_URL ?? "https://xsta360.67-211-210-8.sslip.io"}/c/${card!.slug}`;
  lines.push(`URL:${cardUrl}`);

  Object.entries(card!.socialLinks).forEach(([label, url]) => {
    if (url) lines.push(`URL;${label}:${url}`);
  });

  lines.push("END:VCARD");
  return lines.join("\n") + "\n";
}
