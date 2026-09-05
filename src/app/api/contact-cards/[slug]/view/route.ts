import { NextRequest, NextResponse } from "next/server";
import { getContactCardBySlug, recordCardView } from "@/lib/contact-cards";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const card = await getContactCardBySlug(slug);

  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  let deviceType = "unknown";
  try {
    const body = (await request.json()) as { deviceType?: string };
    const ua = body.deviceType || request.headers.get("user-agent") || "";
    deviceType = classifyDevice(ua);
  } catch {
    const ua = request.headers.get("user-agent") || "";
    deviceType = classifyDevice(ua);
  }

  // Fire-and-forget: don't await if possible.
  recordCardView(card.id, card.orgId, deviceType).catch(() => {
    // ignore analytics failures
  });

  return NextResponse.json({ ok: true });
}

function classifyDevice(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (/android/.test(ua)) return "android";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/mobile/.test(ua)) return "mobile";
  if (/macintosh|windows|linux/.test(ua)) return "desktop";
  return "unknown";
}
