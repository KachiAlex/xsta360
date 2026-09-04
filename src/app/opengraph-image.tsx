import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Xsta360 — Manage. Follow Up. Close.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: "#1e2a22",
          color: "#f3f0e6",
          fontFamily: "monospace",
          padding: "80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "40px" }}>
          <div style={{ width: "28px", height: "28px", borderRadius: "50%", backgroundColor: "#d98a2b" }} />
          <span style={{ fontSize: "64px", fontWeight: 700, letterSpacing: "4px" }}>XSTA360</span>
        </div>
        <div style={{ fontSize: "72px", fontWeight: 700, lineHeight: 1.1, color: "#f3f0e6" }}>Manage.</div>
        <div style={{ fontSize: "72px", fontWeight: 700, lineHeight: 1.1, color: "#9aa39a" }}>Follow Up.</div>
        <div style={{ fontSize: "72px", fontWeight: 700, lineHeight: 1.1, color: "#2f6b4f" }}>Close.</div>
        <div style={{ fontSize: "24px", color: "#9aa39a", marginTop: "32px", fontFamily: "sans-serif" }}>
          Sales management for teams that close deals — not lose them to silence.
        </div>
      </div>
    ),
    { ...size },
  );
}
