import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getSession } from "@/lib/session";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

function safeFilename(raw: string): string | null {
  const base = path.basename(raw);
  if (!base || base !== raw || base.includes("..")) return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(base)) return null;
  return base;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { filename } = await context.params;
  const safe = safeFilename(filename);
  if (!safe) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const diskPath = path.join(UPLOAD_DIR, safe);
  const resolved = path.resolve(diskPath);
  if (!resolved.startsWith(path.resolve(UPLOAD_DIR))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const buf = await readFile(resolved);
    const ext = path.extname(safe).toLowerCase();
    const type =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : ext === ".gif"
            ? "image/gif"
            : ext === ".svg"
              ? "image/svg+xml"
              : "image/jpeg";

    return new NextResponse(buf, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
