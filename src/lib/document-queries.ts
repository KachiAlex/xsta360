import "server-only";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db";

export interface DocumentRow {
  id: string;
  orgId: string;
  leadId: string | null;
  uploadedBy: string | null;
  fileName: string;
  r2Key: string;
  mimeType: string;
  sizeBytes: number;
  publicUrl: string | null;
  createdAt: Date;
  uploaderName: string | null;
}

/**
 * Get all org-level documents (not attached to a lead).
 */
export async function getOrgDocuments(orgId: string): Promise<DocumentRow[]> {
  const rows = await db
    .select({
      id: schema.documents.id,
      orgId: schema.documents.orgId,
      leadId: schema.documents.leadId,
      uploadedBy: schema.documents.uploadedBy,
      fileName: schema.documents.fileName,
      r2Key: schema.documents.r2Key,
      mimeType: schema.documents.mimeType,
      sizeBytes: schema.documents.sizeBytes,
      publicUrl: schema.documents.publicUrl,
      createdAt: schema.documents.createdAt,
      uploaderName: schema.users.name,
    })
    .from(schema.documents)
    .leftJoin(schema.users, eq(schema.documents.uploadedBy, schema.users.id))
    .where(
      and(
        eq(schema.documents.orgId, orgId),
        isNull(schema.documents.leadId),
      ),
    )
    .orderBy(desc(schema.documents.createdAt));

  return rows as DocumentRow[];
}

/**
 * Get all documents attached to a specific lead.
 */
export async function getLeadDocuments(orgId: string, leadId: string): Promise<DocumentRow[]> {
  const rows = await db
    .select({
      id: schema.documents.id,
      orgId: schema.documents.orgId,
      leadId: schema.documents.leadId,
      uploadedBy: schema.documents.uploadedBy,
      fileName: schema.documents.fileName,
      r2Key: schema.documents.r2Key,
      mimeType: schema.documents.mimeType,
      sizeBytes: schema.documents.sizeBytes,
      publicUrl: schema.documents.publicUrl,
      createdAt: schema.documents.createdAt,
      uploaderName: schema.users.name,
    })
    .from(schema.documents)
    .leftJoin(schema.users, eq(schema.documents.uploadedBy, schema.users.id))
    .where(
      and(
        eq(schema.documents.orgId, orgId),
        eq(schema.documents.leadId, leadId),
      ),
    )
    .orderBy(desc(schema.documents.createdAt));

  return rows as DocumentRow[];
}

/**
 * Get a single document by ID (for download/delete verification).
 */
export async function getDocument(orgId: string, docId: string): Promise<DocumentRow | null> {
  const [row] = await db
    .select({
      id: schema.documents.id,
      orgId: schema.documents.orgId,
      leadId: schema.documents.leadId,
      uploadedBy: schema.documents.uploadedBy,
      fileName: schema.documents.fileName,
      r2Key: schema.documents.r2Key,
      mimeType: schema.documents.mimeType,
      sizeBytes: schema.documents.sizeBytes,
      publicUrl: schema.documents.publicUrl,
      createdAt: schema.documents.createdAt,
      uploaderName: schema.users.name,
    })
    .from(schema.documents)
    .leftJoin(schema.users, eq(schema.documents.uploadedBy, schema.users.id))
    .where(
      and(eq(schema.documents.id, docId), eq(schema.documents.orgId, orgId)),
    )
    .limit(1);

  return (row as DocumentRow) ?? null;
}
