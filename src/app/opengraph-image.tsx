import { ImageResponse } from "next/og";
import { siteName } from "@/lib/config";
export const alt = "Official hurricane path maps and local alerts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        background: "#edf4f7",
        color: "#183d52",
        padding: "72px",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", fontSize: 32 }}>{siteName}</div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontSize: 80,
          letterSpacing: "-3px",
        }}
      >
        <span>Understand the storm.</span>
        <span style={{ color: "#607f90" }}>Find your place in it.</span>
      </div>
      <div style={{ display: "flex", fontSize: 25, color: "#607786" }}>
        Official NHC path maps · Local NWS alerts
      </div>
    </div>,
    size,
  );
}
