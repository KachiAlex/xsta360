import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { getDocument } from "@/lib/document-queries";
import { getDownloadUrl } from "@/lib/r2";

export const dynamic = "force-dynamic";

/**
 * GET /api/documents/{id}/download
 * Returns a redirect to the presigned R2 URL (or public URL if bucket is public).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await verifySession();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const doc = await getDocument(ctx.orgId, id);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const url = await getDownloadUrl(doc.r2Key, doc.publicUrl);
  return NextResponse.redirect(url);
}
