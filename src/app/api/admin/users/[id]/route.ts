import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";

const patchSchema = z.object({
  imageUrl: z.string().max(2000).nullable().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const imageUrl =
    parsed.data.imageUrl === undefined ? undefined : parsed.data.imageUrl;

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(imageUrl !== undefined ? { imageUrl } : {}),
    },
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

  await writeAuditLog({
    actorId: session.id,
    action: "user.update",
    entityType: "User",
    entityId: user.id,
    metadata: { fields: imageUrl !== undefined ? ["imageUrl"] : [] },
  });

  return NextResponse.json({ user });
}
