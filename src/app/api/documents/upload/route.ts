import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db, schema } from "@/db";
import { verifySession } from "@/lib/dal";
import { getPresignedUploadUrl, buildPublicUrl } from "@/lib/r2";

export const dynamic = "force-dynamic";

const MAX_SIZE = 100 * 1024 * 1024; // 100 MB

/**
 * POST /api/documents/upload
 * Body: { fileName, mimeType, sizeBytes, leadId? }
 * Returns: { uploadUrl, docId, r2Key, publicUrl }
 *
 * The client:
 * 1. Calls this endpoint to get a presigned upload URL
 * 2. PUTs the file directly to R2 using the presigned URL
 * 3. The document row is created here (before upload) — if the upload fails,
 *    the orphaned row can be cleaned up later
 */
export async function POST(request: NextRequest) {
  const ctx = await verifySession();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { fileName?: string; mimeType?: string; sizeBytes?: number; leadId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { fileName, mimeType, sizeBytes, leadId } = body;

  if (!fileName || typeof fileName !== "string") {
    return NextResponse.json({ error: "fileName is required" }, { status: 400 });
  }
  if (!mimeType || typeof mimeType !== "string") {
    return NextResponse.json({ error: "mimeType is required" }, { status: 400 });
  }
  if (typeof sizeBytes !== "number" || sizeBytes <= 0) {
    return NextResponse.json({ error: "sizeBytes must be a positive number" }, { status: 400 });
  }
  if (sizeBytes > MAX_SIZE) {
    return NextResponse.json({ error: "File too large. Max 100 MB." }, { status: 413 });
  }

  // If leadId is provided, verify the lead belongs to the org.
  if (leadId) {
    const { eq, and } = await import("drizzle-orm");
    const [lead] = await db
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(and(eq(schema.leads.id, leadId), eq(schema.leads.orgId, ctx.orgId)))
      .limit(1);
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const docId = randomUUID();

  // Create the DB record first.
  try {
    const { r2Key, uploadUrl } = await getPresignedUploadUrl({
      orgId: ctx.orgId,
      docId,
      fileName,
      mimeType,
    });

    await db.insert(schema.documents).values({
      id: docId,
      orgId: ctx.orgId,
      leadId: leadId ?? null,
      uploadedBy: ctx.userId,
      fileName,
      r2Key,
      mimeType,
      sizeBytes,
      publicUrl: buildPublicUrl(r2Key),
    });

    return NextResponse.json({ uploadUrl, docId, r2Key, publicUrl: buildPublicUrl(r2Key) });
  } catch (err) {
    console.error("Upload init failed:", err);
    return NextResponse.json({ error: "Failed to initialize upload" }, { status: 500 });
  }
}
