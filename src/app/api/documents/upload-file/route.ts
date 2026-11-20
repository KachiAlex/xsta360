import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db, schema } from "@/db";
import { verifyActiveSession } from "@/lib/dal";
import { uploadToR2, buildPublicUrl } from "@/lib/r2";

export const dynamic = "force-dynamic";

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB — buffered in memory, keep lower than the presigned flow's 100 MB

/**
 * POST /api/documents/upload-file
 * Body: multipart/form-data with a `file` field.
 * Returns: { docId, publicUrl, fileName, mimeType, sizeBytes }
 *
 * Server-side counterpart to /api/documents/upload: the file goes through
 * this API instead of a browser-direct presigned PUT, so it works even when
 * the R2 bucket has no CORS rules for the app origin.
 */
export async function POST(request: NextRequest) {
  const ctx = await verifyActiveSession();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let file: File;
  try {
    const formData = await request.formData();
    const f = formData.get("file");
    if (!(f instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    file = f;
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large. Max 50 MB." }, { status: 413 });
  }

  const mimeType = file.type || "application/octet-stream";
  const docId = randomUUID();

  try {
    const body = Buffer.from(await file.arrayBuffer());
    const r2Key = await uploadToR2({
      orgId: ctx.orgId,
      docId,
      fileName: file.name,
      mimeType,
      body,
    });
    const publicUrl = buildPublicUrl(r2Key);

    await db.insert(schema.documents).values({
      id: docId,
      orgId: ctx.orgId,
      leadId: null,
      uploadedBy: ctx.userId,
      fileName: file.name,
      r2Key,
      mimeType,
      sizeBytes: file.size,
      publicUrl,
    });

    return NextResponse.json({
      docId,
      publicUrl,
      fileName: file.name,
      mimeType,
      sizeBytes: file.size,
    });
  } catch (err) {
    console.error("File upload failed:", err);
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}
