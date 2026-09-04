import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifySession } from "@/lib/dal";
import { getOrgDocuments, getLeadDocuments, getDocument } from "@/lib/document-queries";
import { deleteFromR2, getDownloadUrl } from "@/lib/r2";

export const dynamic = "force-dynamic";

/**
 * GET /api/documents?leadId={uuid}
 * - If leadId is provided, returns documents for that lead.
 * - Otherwise, returns org-level documents (leadId is null).
 */
export async function GET(request: NextRequest) {
  const ctx = await verifySession();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get("leadId");

  if (leadId) {
    const docs = await getLeadDocuments(ctx.orgId, leadId);
    return NextResponse.json({ documents: docs });
  }

  const docs = await getOrgDocuments(ctx.orgId);
  return NextResponse.json({ documents: docs });
}

/**
 * GET /api/documents/{id}/download — handled by [id]/download/route.ts
 * DELETE /api/documents/{id} — handled by [id]/route.ts
 */

/**
 * DELETE /api/documents?id={uuid}
 */
export async function DELETE(request: NextRequest) {
  const ctx = await verifySession();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const docId = searchParams.get("id");
  if (!docId) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const doc = await getDocument(ctx.orgId, docId);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  // Delete from R2 first (best effort).
  try {
    await deleteFromR2(doc.r2Key);
  } catch (err) {
    console.error("R2 delete failed (continuing with DB delete):", err);
  }

  // Delete from DB.
  await db
    .delete(schema.documents)
    .where(and(eq(schema.documents.id, docId), eq(schema.documents.orgId, ctx.orgId)));

  return NextResponse.json({ ok: true });
}
