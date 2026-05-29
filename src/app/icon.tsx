import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1A1340 0%, #2D2560 100%)",
          borderRadius: 8,
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 32 32"
          fill="none"
        >
          <line x1="7" y1="7" x2="16" y2="16" stroke="#7F77DD" strokeWidth="1.4" opacity="0.6" />
          <line x1="16" y1="16" x2="7" y2="25" stroke="#7F77DD" strokeWidth="1.4" opacity="0.6" />
          <line x1="16" y1="16" x2="25" y2="10" stroke="#0ABFAD" strokeWidth="1.6" opacity="0.9" />
          <line x1="25" y1="10" x2="25" y2="23" stroke="#7F77DD" strokeWidth="1.4" opacity="0.5" />
          <circle cx="7" cy="7" r="3" fill="#534AB7" />
          <circle cx="7" cy="25" r="3" fill="#534AB7" />
          <circle cx="16" cy="16" r="5" fill="#6A61D0" />
          <circle cx="16" cy="16" r="2" fill="#FFFFFF" opacity="0.92" />
          <circle cx="25" cy="10" r="3.5" fill="#0ABFAD" />
          <circle cx="25" cy="23" r="2.5" fill="#7F77DD" opacity="0.85" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
