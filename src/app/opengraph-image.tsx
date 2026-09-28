import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site-config";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = SITE_NAME;

/** Phase 31 — Part 4, SEO. A real, server-rendered OG card (next/og) — no static image asset to keep in sync with the brand. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          backgroundColor: "#faf8f3",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 120,
            height: 120,
            borderRadius: 28,
            backgroundColor: "#211d17",
          }}
        >
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#faf8f3" strokeWidth="1.75">
            <path d="M22 10v6M2 10l10-5 10 5-10 5-10-5Z" />
            <path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" />
          </svg>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span style={{ fontSize: 68, fontWeight: 600, color: "#211d17" }}>Aurelius</span>
          <span style={{ fontSize: 68, fontWeight: 600, color: "#785a29" }}>IELTS</span>
        </div>
        <span style={{ fontSize: 26, color: "#5c5648" }}>Real progress. Real feedback. Real results.</span>
      </div>
    ),
    { ...size }
  );
}
