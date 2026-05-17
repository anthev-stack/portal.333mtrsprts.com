import { ImageResponse } from "next/og";
import { SITE_DESCRIPTION_SHORT, SITE_NAME } from "@/lib/site-metadata";

export const alt = SITE_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(165deg, #0a0a0a 0%, #171717 45%, #262626 100%)",
          padding: 72,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 88,
            fontWeight: 600,
            color: "#fafafa",
            letterSpacing: "-0.03em",
            lineHeight: 1,
          }}
        >
          333
        </p>
        <p
          style={{
            margin: "12px 0 0",
            fontSize: 64,
            fontWeight: 600,
            color: "#fafafa",
            letterSpacing: "0.06em",
            lineHeight: 1.1,
          }}
        >
          MOTORSPORTS
        </p>
        <p
          style={{
            margin: "36px 0 0",
            fontSize: 30,
            fontWeight: 500,
            color: "#d4d4d4",
            textAlign: "center",
            lineHeight: 1.35,
            maxWidth: 920,
          }}
        >
          {SITE_DESCRIPTION_SHORT}
        </p>
        <p
          style={{
            margin: "28px 0 0",
            fontSize: 22,
            color: "#a3a3a3",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          Staff portal
        </p>
      </div>
    ),
    { ...size },
  );
}
