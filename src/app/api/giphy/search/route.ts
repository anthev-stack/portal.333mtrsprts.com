import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.NEXT_PUBLIC_GIPHY_API_KEY || "dc6zaTOxFJmzC";
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();

  const endpoint = q
    ? `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(q)}&limit=20&rating=pg-13`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${encodeURIComponent(apiKey)}&limit=20&rating=pg-13`;

  const res = await fetch(endpoint, {
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Giphy unavailable" }, { status: 502 });
  }

  const json = (await res.json()) as {
    data: Array<{
      id: string;
      title: string;
      images: {
        fixed_width_small: { url: string };
        original: { url: string };
      };
    }>;
  };

  const gifs = json.data.map((item) => ({
    id: item.id,
    title: item.title || "GIF",
    previewUrl: item.images.fixed_width_small.url,
    url: item.images.original.url,
  }));

  return NextResponse.json({ gifs });
}
