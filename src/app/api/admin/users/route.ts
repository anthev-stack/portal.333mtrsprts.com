import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      internalEmail: true,
      externalEmail: true,
      role: true,
      department: true,
      position: true,
      imageUrl: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ users });
}

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  internalEmail: z.string().email("Enter a valid internal email"),
  externalEmail: z.string().email("Enter a valid external email"),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters"),
  role: z.nativeEnum(Role).optional(),
  imageUrl: z.string().max(2000).nullable().optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const message = first?.message ?? "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const internalEmail = parsed.data.internalEmail.toLowerCase().trim();
  const exists = await prisma.user.findUnique({
    where: { internalEmail },
  });
  if (exists) {
    return NextResponse.json({ error: "Email already in use" }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);

  const imageUrl =
    parsed.data.imageUrl === undefined || parsed.data.imageUrl === null
      ? undefined
      : parsed.data.imageUrl.trim() || null;

  let user;
  try {
    user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        internalEmail,
        externalEmail: parsed.data.externalEmail.toLowerCase().trim(),
        passwordHash,
        role: parsed.data.role ?? Role.STAFF,
        ...(imageUrl !== undefined ? { imageUrl } : {}),
      },
      select: {
        id: true,
        name: true,
        internalEmail: true,
        externalEmail: true,
        role: true,
        imageUrl: true,
      },
    });
  } catch (e) {
    console.error("[POST /api/admin/users] create failed:", e);
    return NextResponse.json(
      { error: "Could not create user (check server logs)" },
      { status: 500 },
    );
  }

  await writeAuditLog({
    actorId: session.id,
    action: "user.create",
    entityType: "User",
    entityId: user.id,
    metadata: { internalEmail: user.internalEmail },
  });

  return NextResponse.json({ user });
}
