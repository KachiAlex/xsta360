import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { transcribeAudio } from "@/lib/whisper";

export const runtime = "nodejs";
// Disable body parsing — we need the raw ArrayBuffer.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // Verify session.
  const ctx = await verifySession();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Accept audio as raw body (WAV format).
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("audio/") && !contentType.includes("application/octet-stream")) {
    return NextResponse.json({ error: "Expected audio content type" }, { status: 400 });
  }

  try {
    const arrayBuffer = await req.arrayBuffer();

    // Max 10MB of audio.
    if (arrayBuffer.byteLength > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio too large (max 10MB)" }, { status: 413 });
    }

    const text = await transcribeAudio(arrayBuffer);
    return NextResponse.json({ text });
  } catch (err) {
    console.error("Transcription error:", err);
    const message = err instanceof Error ? err.message : "Transcription failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
