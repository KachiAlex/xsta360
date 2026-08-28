"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifySession } from "@/lib/dal";
import { logEvent } from "@/lib/audit";

export type DocFormState = {
  errors?: Record<string, string[]>;
  message?: string;
  ok?: boolean;
};

/**
 * Upload a document link for a lead.
 * In production this would handle file uploads to R2/S3.
 * For now, accepts a URL + filename.
 */
export async function uploadLeadDocument(
  _prev: DocFormState,
  formData: FormData,
): Promise<DocFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const leadId = String(formData.get("leadId"));
  const filename = String(formData.get("filename") || "");
  const url = String(formData.get("url") || "");
  const mimeType = String(formData.get("mimeType") || "");
  const sizeStr = String(formData.get("size") || "");

  if (!filename) return { errors: { filename: ["Filename is required"] } };
  if (!url) return { errors: { url: ["URL is required"] } };

  // Verify lead belongs to org.
  const [lead] = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.orgId, ctx.orgId)))
    .limit(1);

  if (!lead) return { message: "Lead not found" };

  const [doc] = await db
    .insert(schema.leadDocuments)
    .values({
      leadId,
      orgId: ctx.orgId,
      uploadedBy: ctx.userId,
      filename,
      url,
      mimeType: mimeType || null,
      size: sizeStr ? parseInt(sizeStr) : null,
    })
    .returning();

  await logEvent(ctx.orgId, "document_uploaded", {
    leadId,
    actorId: ctx.userId,
    meta: { docId: doc.id, filename },
  });

  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function deleteLeadDocument(
  _prev: DocFormState,
  formData: FormData,
): Promise<DocFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const docId = String(formData.get("id"));
  const [deleted] = await db
    .delete(schema.leadDocuments)
    .where(
      and(eq(schema.leadDocuments.id, docId), eq(schema.leadDocuments.orgId, ctx.orgId)),
    )
    .returning({ leadId: schema.leadDocuments.leadId });

  if (deleted) {
    revalidatePath(`/leads/${deleted.leadId}`);
  }
  return { ok: true };
}

export async function markDocumentViewed(
  _prev: DocFormState,
  formData: FormData,
): Promise<DocFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const docId = String(formData.get("id"));
  await db
    .update(schema.leadDocuments)
    .set({ viewedAt: new Date() })
    .where(
      and(eq(schema.leadDocuments.id, docId), eq(schema.leadDocuments.orgId, ctx.orgId)),
    );

  return { ok: true };
}
