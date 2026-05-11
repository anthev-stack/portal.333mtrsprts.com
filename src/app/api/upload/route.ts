import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const articleId = form.get("articleId");
  const messageId = form.get("messageId");
  const purpose = form.get("purpose");

  const buf = Buffer.from(await file.arrayBuffer());

  if (purpose === "profile") {
    const mime = file.type || "";
    if (!mime.startsWith("image/")) {
      return NextResponse.json({ error: "Image files only" }, { status: 400 });
    }
    const maxBytes = 5 * 1024 * 1024;
    if (buf.length > maxBytes) {
      return NextResponse.json({ error: "Image too large (max 5MB)" }, { status: 400 });
    }
  }
  const ext = path.extname(file.name) || "";
  const name = `${Date.now()}-${randomBytes(8).toString("hex")}${ext}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  const diskPath = path.join(uploadDir, name);
  await writeFile(diskPath, buf);

  const url = `/uploads/${name}`;

  let attachmentId: string | null = null;

  if (typeof articleId === "string" && articleId.length > 0) {
    const attachment = await prisma.attachment.create({
      data: {
        filename: file.name,
        url,
        mimeType: file.type || null,
        size: buf.length,
        articleId,
      },
    });
    attachmentId = attachment.id;
  } else if (typeof messageId === "string" && messageId.length > 0) {
    const attachment = await prisma.attachment.create({
      data: {
        filename: file.name,
        url,
        mimeType: file.type || null,
        size: buf.length,
        messageId,
      },
    });
    attachmentId = attachment.id;
  }

  return NextResponse.json({
    id: attachmentId,
    url,
    filename: file.name,
    mimeType: file.type || null,
    size: buf.length,
  });
}
