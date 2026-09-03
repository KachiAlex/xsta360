import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { submitCardLead, CardLeadError } from "@/lib/contact-cards";

export const dynamic = "force-dynamic";

const CardLeadSchema = z.object({
  name: z.string().min(1, "Name is required").trim(),
  email: z.string().email("Enter a valid email").trim().toLowerCase(),
  phone: z.string().min(1, "Phone is required").trim(),
  company: z.string().trim().optional().or(z.literal("")),
});

// Simple per-IP rate limit: 10 submissions per minute.
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many submissions. Try again later." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CardLeadSchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.issues.reduce<Record<string, string[]>>((acc, issue) => {
      const key = issue.path[0]?.toString() ?? "_";
      (acc[key] ??= []).push(issue.message);
      return acc;
    }, {});
    return NextResponse.json({ error: "Validation failed", errors }, { status: 422 });
  }

  try {
    const result = await submitCardLead(slug, {
      ...parsed.data,
      company: parsed.data.company || null,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof CardLeadError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Card lead submission failed:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) ?? [];
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const recent = timestamps.filter((t) => t > windowStart);
  recent.push(now);
  rateLimitMap.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX;
}
