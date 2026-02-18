import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";

export const runtime = "nodejs";
export const alt = "Portsie - Your portfolio investment tracker";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const iconData = await readFile(
    join(process.cwd(), "public/brand/portsie-icon-blue.png")
  );
  const iconBase64 = `data:image/png;base64,${iconData.toString("base64")}`;

  const wordmarkData = await readFile(
    join(process.cwd(), "public/brand/portsie-wordmark-dark.png")
  );
  const wordmarkBase64 = `data:image/png;base64,${wordmarkData.toString("base64")}`;

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
          backgroundColor: "#ffffff",
          gap: "24px",
        }}
      >
        <img src={iconBase64} width={200} height={200} alt="" />
        <img src={wordmarkBase64} width={240} height={48} alt="" />
        <p
          style={{
            fontSize: 28,
            color: "#6b7280",
            margin: 0,
            fontFamily: "sans-serif",
          }}
        >
          Your portfolio investment tracker
        </p>
      </div>
    ),
    { ...size }
  );
}
