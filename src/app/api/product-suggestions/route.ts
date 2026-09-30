import { NextResponse } from "next/server";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { AccountStatus, ProductSuggestionStatus } from "@prisma/client";
import {
  corsHeaders,
  corsResponse,
  originAllowed,
  suggestionsKeyOk,
} from "@/lib/storefront-cors";

const hits = new Map<string, { n: number; reset: number }>();

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const row = hits.get(ip);
  if (!row || now > row.reset) {
    hits.set(ip, { n: 1, reset: now + 60 * 60 * 1000 });
    return false;
  }
  row.n += 1;
  return row.n > 8;
}

function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("tab") || "NEW";
  const status =
    tab === "all"
      ? undefined
      : (Object.values(ProductSuggestionStatus) as string[]).includes(tab)
        ? (tab as ProductSuggestionStatus)
        : ProductSuggestionStatus.NEW;

  const rows = await prisma.productSuggestion.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ suggestions: rows });
}

export async function POST(request: Request) {
  if (!originAllowed(request) || !suggestionsKeyOk(request)) {
    return corsResponse(request, { error: "Not allowed" }, 403);
  }

  const ip = clientIp(request);
  if (rateLimited(ip)) {
    return corsResponse(request, { error: "Too many suggestions. Try again later." }, 429);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return corsResponse(request, { error: "Invalid form data" }, 400);
  }

  if (str(form, "company_website")) {
    return corsResponse(request, { ok: true });
  }

  const name = str(form, "name");
  const emailRaw = str(form, "email").toLowerCase();
  const phone = str(form, "phone") || null;
  const productName = str(form, "productName") || null;
  const description = str(form, "description");
  const extraNotes = str(form, "extraNotes") || null;
  const shopifyCustomerId = str(form, "shopifyCustomerId") || null;

  if (name.length < 2) {
    return corsResponse(request, { error: "Please add your name." }, 400);
  }
  const emailOk = z.string().email().safeParse(emailRaw);
  if (!emailOk.success) {
    return corsResponse(request, { error: "Please add a valid email." }, 400);
  }
  if (description.length < 8) {
    return corsResponse(request, { error: "Please describe the product." }, 400);
  }

  let photoUrl: string | null = null;
  let photoFilename: string | null = null;
  const file = form.get("photo");
  if (file instanceof File && file.size > 0) {
    const mime = file.type || "";
    if (!mime.startsWith("image/")) {
      return corsResponse(request, { error: "Photos must be an image file." }, 400);
    }
    if (file.size > 8 * 1024 * 1024) {
      return corsResponse(request, { error: "Photo is too large (max 8MB)." }, 400);
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name || "").toLowerCase() || ".jpg";
    const allowed = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic"];
    const useExt = allowed.includes(ext) ? ext : ".jpg";
    const diskName = `${Date.now()}-${randomBytes(8).toString("hex")}${useExt}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, diskName), buf);
    photoUrl = `/uploads/${diskName}`;
    photoFilename = file.name || diskName;
  }

  const created = await prisma.productSuggestion.create({
    data: {
      name,
      email: emailOk.data,
      phone,
      productName,
      description,
      extraNotes,
      shopifyCustomerId,
      photoUrl,
      photoFilename,
    },
  });

  try {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", accountStatus: AccountStatus.ACTIVE },
      select: { id: true },
    });
    if (admins.length) {
      const preview = [productName, description].filter(Boolean).join(" — ").slice(0, 220);
      await prisma.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.id,
          type: "product_suggestion",
          title: `Product suggestion from ${name}`,
          body: preview || "New product suggestion",
          link: "/product-suggestions",
        })),
      });
    }
  } catch (error) {
    console.error("Product suggestion notify failed", error);
  }

  return corsResponse(request, { ok: true, id: created.id });
}
